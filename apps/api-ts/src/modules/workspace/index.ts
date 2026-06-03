import prisma from "@db";
import {authPlugin} from "@middleware/auth";
import {Prisma} from "@prisma/client";
import {applyIssueFilters, normalizeFilters} from "@utils/filters";
import {paginate} from "@utils/pagination";
import {nextSequenceId} from "@utils/sequence";
import {invalidateStorageCache, type S3Config} from "@utils/storage";
import {COMMENT_FTS_DOC_C, ensureSearchIndexes, ISSUE_FTS_DOC_I, PT_FTS_CONFIG} from "@utils/search";
import {ISSUE_INCLUDE, serializeIssue} from "@utils/serialize";
import {getWorkspaceOrFail, requireWorkspaceMember, requireWorkspaceWriter} from "@utils/workspace";
import {randomBytes, randomUUID} from "crypto";
import Elysia from "elysia";

type QuickLinkRecord = {
  id: string;
  title: string;
  url: string;
  metadata: Record<string, unknown>;
  workspace_slug: string;
  created_by_id: string;
  created_at: string;
};

type RecentVisitRecord = {
  id: string;
  entityType: "issue" | "page" | "project";
  entityId: string;
  visitedAt: Date;
};

type RecentActivityRecord =
  | {
      id: string;
      entity_name: "issue";
      entity_identifier: string;
      visited_at: string;
      entity_data: Record<string, unknown>;
    }
  | {
      id: string;
      entity_name: "page";
      entity_identifier: string;
      visited_at: string;
      entity_data: Record<string, unknown>;
    }
  | {
      id: string;
      entity_name: "project";
      entity_identifier: string;
      visited_at: string;
      entity_data: Record<string, unknown>;
    };

const QUICK_LINKS_STORAGE_KEY = "quick_links";

function normalizeQuickLinkUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

function getStoredQuickLinks(displayFilters: unknown): QuickLinkRecord[] {
  const filters = (displayFilters as Record<string, unknown> | null | undefined) ?? {};
  const quickLinks = filters[QUICK_LINKS_STORAGE_KEY];
  return Array.isArray(quickLinks) ? (quickLinks as QuickLinkRecord[]) : [];
}

async function getWorkspaceQuickLinks(workspaceId: string, userId: string) {
  const props = await prisma.workspaceUserProperties.findUnique({
    where: {workspaceId_userId: {workspaceId, userId}},
    select: {displayFilters: true},
  });
  return getStoredQuickLinks(props?.displayFilters);
}

async function saveWorkspaceQuickLinks(workspaceId: string, userId: string, quickLinks: QuickLinkRecord[]) {
  const props = await prisma.workspaceUserProperties.findUnique({
    where: {workspaceId_userId: {workspaceId, userId}},
    select: {displayFilters: true, filters: true, displayProperties: true},
  });
  const existingDisplayFilters = (props?.displayFilters as Record<string, unknown> | null | undefined) ?? {};
  const existingFilters = (props?.filters as Record<string, unknown> | null | undefined) ?? {};
  const existingDisplayProperties = (props?.displayProperties as Record<string, unknown> | null | undefined) ?? {};

  await prisma.workspaceUserProperties.upsert({
    where: {workspaceId_userId: {workspaceId, userId}},
    update: {
      displayFilters: {...existingDisplayFilters, [QUICK_LINKS_STORAGE_KEY]: quickLinks},
    },
    create: {
      workspaceId,
      userId,
      filters: existingFilters,
      displayFilters: {...existingDisplayFilters, [QUICK_LINKS_STORAGE_KEY]: quickLinks},
      displayProperties: existingDisplayProperties,
    },
  });
}

function serializeQuickLink(workspaceSlug: string, link: QuickLinkRecord) {
  return {
    id: link.id,
    title: link.title,
    url: link.url,
    metadata: link.metadata ?? {},
    workspace_slug: workspaceSlug,
    created_by_id: link.created_by_id,
    created_at: link.created_at,
  };
}

function serializeRecentIssue(issue: any) {
  return {
    id: issue.id,
    name: issue.name,
    state: issue.stateId ?? null,
    priority: issue.priority ?? "none",
    assignees: issue.assignees?.map((assignee: any) => assignee.assigneeId) ?? [],
    type: issue.issueTypeId ?? null,
    sequence_id: issue.sequenceId ?? 0,
    project_id: issue.projectId ?? null,
    project_identifier: issue.project?.identifier ?? null,
    is_epic: issue.issueType?.isEpic ?? false,
  };
}

function serializeRecentPage(page: any) {
  const project = page.projects?.[0]?.project ?? null;
  return {
    id: page.id,
    name: page.name,
    logo_props: {},
    project_id: project?.id ?? null,
    owned_by: page.ownedById,
    project_identifier: project?.identifier ?? null,
  };
}

function serializeRecentProject(project: any) {
  return {
    id: project.id,
    name: project.name,
    logo_props: project.iconProp ?? {},
    project_members: project.members?.map((member: any) => member.memberId) ?? [],
    identifier: project.identifier,
  };
}

async function workspaceDto(ws: any, memberRole?: number) {
  const adminMember = await prisma.workspaceMember.findFirst({
    where: {workspaceId: ws.id, role: {gte: 20}, deletedAt: null},
    include: {member: {select: {id: true, email: true, firstName: true, lastName: true, displayName: true, avatar: true, avatarUrl: true}}},
  });
  const [totalMembers, totalProjects] = await Promise.all([
    prisma.workspaceMember.count({where: {workspaceId: ws.id, isActive: true, deletedAt: null}}),
    prisma.project.count({where: {workspaceId: ws.id, deletedAt: null}}),
  ]);
  const owner = adminMember?.member;
  return {
    id: ws.id,
    name: ws.name,
    slug: ws.slug,
    url: `/${ws.slug}`,
    logo: ws.logo ?? null,
    logo_url: ws.logoUrl ?? null,
    organization_size: ws.orgSize ?? "",
    timezone: ws.timezone ?? "UTC",
    created_at: ws.createdAt instanceof Date ? ws.createdAt.toISOString() : ws.createdAt,
    updated_at: ws.updatedAt instanceof Date ? ws.updatedAt.toISOString() : ws.updatedAt,
    created_by: owner?.id ?? "",
    updated_by: owner?.id ?? "",
    owner: owner
      ? {
          id: owner.id,
          email: owner.email,
          first_name: owner.firstName,
          last_name: owner.lastName,
          display_name: owner.displayName,
          avatar: owner.avatar ?? "",
          avatar_url: owner.avatarUrl ?? null,
          is_bot: false,
        }
      : null,
    total_members: totalMembers,
    total_projects: totalProjects,
    role: memberRole ?? null,
  };
}

// The Sticky DB columns (title/description/color) differ from the frontend
// TSticky field names (name/description_html/background_color). Map both ways so
// edits persist and reload correctly.
function serializeSticky(s: any) {
  return {
    id: s.id,
    name: s.title ?? "",
    description: undefined,
    description_html: s.description ?? "<p></p>",
    background_color: s.color,
    sort_order: s.sortOrder,
    logo_props: undefined,
    workspace: s.workspaceId,
    created_at: s.createdAt?.toISOString?.() ?? s.createdAt,
    updated_at: s.updatedAt?.toISOString?.() ?? s.updatedAt,
  };
}

export const workspaceModule = new Elysia({prefix: "/workspaces"})
  .use(authPlugin)

  // ── Slug availability (GET /workspaces/workspace-slug-check/ is the fallback;
  //    the canonical path /workspace-slug-check/ is added directly in index.ts) ──

  .get("/workspace-slug-check/", async ({query, set}) => {
    const slug = (query.slug as string | undefined)?.toLowerCase();
    if (!slug) {
      set.status = 400;
      return {error: "slug is required."};
    }
    const RESTRICTED = ["admin", "api", "auth", "plane", "god-mode", "spaces", "home", "login", "signup", "settings"];
    const taken = RESTRICTED.includes(slug) || (await prisma.workspace.findFirst({where: {slug}})) !== null;
    return {status: !taken};
  })

  // ── List user workspaces ───────────────────────────────────────────────────

  .get("/", async ({user}) => {
    const memberships = await prisma.workspaceMember.findMany({
      where: {memberId: user.id, isActive: true, deletedAt: null},
      include: {workspace: true},
      orderBy: {createdAt: "desc"},
    });
    return Promise.all(memberships.map((m) => workspaceDto(m.workspace, m.role)));
  })

  // ── Create workspace ───────────────────────────────────────────────────────

  .post("/", async ({body, user, set}) => {
    const b = body as any;
    if (!b.name) {
      set.status = 400;
      return {detail: "Name is required."};
    }
    if (!b.slug) {
      set.status = 400;
      return {detail: "Slug is required."};
    }

    const exists = await prisma.workspace.findFirst({where: {slug: b.slug, deletedAt: null}});
    if (exists) {
      set.status = 409;
      return {detail: "Workspace with this slug already exists."};
    }

    const ws = await prisma.$transaction(async (tx) => {
      const w = await tx.workspace.create({
        data: {name: b.name, slug: b.slug, orgSize: b.org_size ?? null, timezone: b.timezone ?? "UTC"},
      });
      await tx.workspaceMember.create({
        data: {workspaceId: w.id, memberId: user.id, role: 20, isActive: true},
      });
      return w;
    });
    set.status = 201;
    return workspaceDto(ws, 20);
  })

  // ── Get / Update / Delete workspace ───────────────────────────────────────

  .get("/:slug/", async ({params: {slug}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    const m = await requireWorkspaceMember(ws.id, user.id);
    return workspaceDto(ws, m.role);
  })

  .patch("/:slug/", async ({params: {slug}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    const m = await requireWorkspaceWriter(ws.id, user.id);
    if (m.role < 20) {
      set.status = 403;
      return {detail: "Only admins can update workspace settings."};
    }
    const b = body as any;
    const data: any = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.org_size !== undefined) data.orgSize = b.org_size;
    if (b.timezone !== undefined) data.timezone = b.timezone;
    if (b.logo !== undefined) data.logo = b.logo;
    const updated = await prisma.workspace.update({where: {id: ws.id}, data});
    return workspaceDto(updated, m.role);
  })

  // ── Delete workspace ──────────────────────────────────────────────────────

  .delete("/:slug/", async ({params: {slug}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    const m = await requireWorkspaceWriter(ws.id, user.id);
    if (m.role < 20) {
      set.status = 403;
      return {detail: "Only admins can delete workspaces."};
    }
    await prisma.workspace.update({where: {id: ws.id}, data: {deletedAt: new Date()}});
    set.status = 204;
    return null;
  })

  // ── Project identifier availability (frontend calls /project-identifiers) ──

  .get("/:slug/project-identifiers", async ({params: {slug}, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    const identifier = (query.name as string | undefined)?.toUpperCase();
    if (!identifier) return {status: false};
    const taken = await prisma.project.findFirst({where: {workspaceId: ws.id, identifier, deletedAt: null}});
    return {status: !taken};
  })

  // ── Invitations ───────────────────────────────────────────────────────────

  .get("/:slug/invitations/", async ({params: {slug}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const invites = await prisma.workspaceMemberInvite.findMany({
      where: {workspaceId: ws.id, accepted: false},
      orderBy: {createdAt: "desc"},
    });
    return invites.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      token: i.token,
      accepted: i.accepted,
      message: "",
      responded_at: null,
      invite_link: `${process.env.APP_BASE_URL ?? "http://localhost"}/invitations/${i.token}/`,
      workspace: {id: ws.id, name: ws.name, slug: ws.slug, logo_url: ws.logoUrl ?? null},
      created_at: i.createdAt.toISOString(),
      updated_at: i.updatedAt.toISOString(),
    }));
  })

  .post("/:slug/invitations/", async ({params: {slug}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    const m = await requireWorkspaceWriter(ws.id, user.id);
    if (m.role < 15) {
      set.status = 403;
      return {detail: "Only members can invite others."};
    }

    const emails: Array<{email: string; role: number}> = (body as any).emails ?? [];
    const invites = await prisma.workspaceMemberInvite.createMany({
      data: emails.map((e) => ({
        workspaceId: ws.id,
        email: e.email,
        role: e.role ?? 5,
        token: randomBytes(32).toString("hex"),
      })),
    });
    set.status = 201;
    return {invited: invites.count};
  })

  .delete("/:slug/invitations/:pk/", async ({params: {slug, pk}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    await prisma.workspaceMemberInvite.delete({where: {id: pk}}).catch(() => {});
    set.status = 204;
    return null;
  })

  // ── Stickies ──────────────────────────────────────────────────────────────

  .get("/:slug/stickies/", async ({params: {slug}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where = {workspaceId: ws.id, ownerId: user.id, deletedAt: null};
    return paginate({
      query: (skip, take) => prisma.sticky.findMany({where, skip, take, orderBy: {sortOrder: "asc"}}),
      count: () => prisma.sticky.count({where}),
      cursor: query.cursor as string | undefined,
      transform: (items) => items.map(serializeSticky),
    });
  })

  .post("/:slug/stickies/", async ({params: {slug}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    const sticky = await prisma.sticky.create({
      data: {
        workspaceId: ws.id,
        ownerId: user.id,
        title: b.name ?? b.title ?? "",
        description: b.description_html ?? (typeof b.description === "string" ? b.description : null),
        color: b.background_color ?? b.color ?? "#ffffff",
        ...(b.sort_order !== undefined ? {sortOrder: b.sort_order} : {}),
      },
    });
    set.status = 201;
    return serializeSticky(sticky);
  })

  .patch("/:slug/stickies/:sticky_id/", async ({params: {slug, sticky_id}, body, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    const data: any = {};
    if (b.name !== undefined) data.title = b.name;
    if (b.title !== undefined) data.title = b.title;
    if (b.description_html !== undefined) data.description = b.description_html;
    else if (typeof b.description === "string") data.description = b.description;
    if (b.background_color !== undefined) data.color = b.background_color;
    if (b.color !== undefined) data.color = b.color;
    if (b.sort_order !== undefined) data.sortOrder = b.sort_order;
    const updated = await prisma.sticky.update({where: {id: sticky_id}, data});
    return serializeSticky(updated);
  })

  .delete("/:slug/stickies/:sticky_id/", async ({params: {slug, sticky_id}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    await prisma.sticky.update({where: {id: sticky_id}, data: {deletedAt: new Date()}});
    set.status = 204;
    return null;
  })

  // ── User Favorites ────────────────────────────────────────────────────────

  .get("/:slug/favorites/", async ({params: {slug}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where = {workspaceId: ws.id, userId: user.id, deletedAt: null};
    return paginate({
      query: (skip, take) => prisma.userFavorite.findMany({where, skip, take, orderBy: {sequence: "asc"}}),
      count: () => prisma.userFavorite.count({where}),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/:slug/favorites/", async ({params: {slug}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    const fav = await prisma.userFavorite.create({
      data: {
        workspaceId: ws.id,
        userId: user.id,
        entityType: b.entity_type,
        entityId: b.entity_id,
        name: b.name ?? "",
        parentId: b.parent ?? null,
      },
    });
    set.status = 201;
    return fav;
  })

  .delete("/:slug/favorites/:favorite_id/", async ({params: {slug, favorite_id}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    await prisma.userFavorite.update({where: {id: favorite_id}, data: {deletedAt: new Date()}});
    set.status = 204;
    return null;
  })

  // ── Recent Visits ─────────────────────────────────────────────────────────

  .get("/:slug/recent-visits/", async ({params: {slug}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const entityName = query.entity_name as string | undefined;
    const where = {
      workspaceId: ws.id,
      userId: user.id,
      entityType: entityName ? entityName : {in: ["issue", "page", "project"]},
    };

    const recentVisits = (await prisma.userRecentVisit.findMany({
      where,
      orderBy: {visitedAt: "desc"},
      take: 20,
    })) as RecentVisitRecord[];

    const issueIds = recentVisits
      .filter((visit: RecentVisitRecord) => visit.entityType === "issue")
      .map((visit: RecentVisitRecord) => visit.entityId);
    const pageIds = recentVisits
      .filter((visit: RecentVisitRecord) => visit.entityType === "page")
      .map((visit: RecentVisitRecord) => visit.entityId);
    const projectIds = recentVisits
      .filter((visit: RecentVisitRecord) => visit.entityType === "project")
      .map((visit: RecentVisitRecord) => visit.entityId);

    const [issues, pages, projects] = await Promise.all([
      issueIds.length
        ? prisma.issue.findMany({
            where: {id: {in: issueIds}, workspaceId: ws.id, deletedAt: null},
            include: {
              state: {select: {id: true, name: true, color: true, group: true}},
              assignees: {where: {deletedAt: null}, select: {assigneeId: true}},
              issueType: {select: {id: true, isEpic: true}},
              project: {select: {id: true, identifier: true}},
            },
          })
        : [],
      pageIds.length
        ? prisma.page.findMany({
            where: {id: {in: pageIds}, workspaceId: ws.id, deletedAt: null},
            include: {
              ownedBy: {select: {id: true}},
              projects: {include: {project: {select: {id: true, identifier: true}}}},
            },
          })
        : [],
      projectIds.length
        ? prisma.project.findMany({
            where: {id: {in: projectIds}, workspaceId: ws.id, deletedAt: null},
            include: {members: {where: {deletedAt: null}, select: {memberId: true}}},
          })
        : [],
    ]);

    const issueMap = new Map((issues as Array<any>).map((issue) => [issue.id, issue] as const));
    const pageMap = new Map((pages as Array<any>).map((page) => [page.id, page] as const));
    const projectMap = new Map((projects as Array<any>).map((project) => [project.id, project] as const));

    const activities = recentVisits
      .map((visit): RecentActivityRecord | null => {
        if (visit.entityType === "issue") {
          const issue = issueMap.get(visit.entityId);
          return issue
            ? {
                id: visit.id,
                entity_name: visit.entityType,
                entity_identifier: visit.entityId,
                visited_at: visit.visitedAt.toISOString(),
                entity_data: serializeRecentIssue(issue),
              }
            : null;
        }

        if (visit.entityType === "page") {
          const page = pageMap.get(visit.entityId);
          return page
            ? {
                id: visit.id,
                entity_name: visit.entityType,
                entity_identifier: visit.entityId,
                visited_at: visit.visitedAt.toISOString(),
                entity_data: serializeRecentPage(page),
              }
            : null;
        }

        if (visit.entityType === "project") {
          const project = projectMap.get(visit.entityId);
          return project
            ? {
                id: visit.id,
                entity_name: visit.entityType,
                entity_identifier: visit.entityId,
                visited_at: visit.visitedAt.toISOString(),
                entity_data: serializeRecentProject(project),
              }
            : null;
        }

        return null;
      })
      .filter((activity): activity is RecentActivityRecord => activity !== null);

    return activities;
  })

  .post("/:slug/recent-visits/", async ({params: {slug}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    const visit = await prisma.userRecentVisit
      .upsert({
        where: {id: "00000000-0000-0000-0000-000000000000"}, // fake - will never match
        update: {visitedAt: new Date()},
        create: {
          workspaceId: ws.id,
          userId: user.id,
          entityType: b.entity_type,
          entityId: b.entity_id,
        },
      })
      .catch(async () =>
        prisma.userRecentVisit.create({
          data: {workspaceId: ws.id, userId: user.id, entityType: b.entity_type, entityId: b.entity_id},
        }),
      );
    set.status = 201;
    return visit;
  })

  // ── Legacy PowerK search (backward compat) ──────────────────────────────

  .get("/:slug/search/", async ({params: {slug}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const q = ((query as any).search ?? (query as any).query ?? "") as string;
    if (!q.trim()) return {results: {issue: [], project: [], page: [], cycle: [], module: [], workspace: [], issue_view: []}};
    const [issues, projects] = await Promise.all([
      prisma.issue.findMany({
        where: {workspaceId: ws.id, deletedAt: null, OR: [{name: {contains: q, mode: "insensitive"}}, {legacyTicketNumber: {contains: q}}]},
        select: {
          id: true,
          name: true,
          sequenceId: true,
          priority: true,
          legacyTicketNumber: true,
          project: {select: {id: true, identifier: true}},
          state: {select: {group: true}},
        },
        take: 10,
      }),
      prisma.project.findMany({
        where: {workspaceId: ws.id, deletedAt: null, name: {contains: q, mode: "insensitive"}},
        select: {id: true, name: true, identifier: true},
        take: 5,
      }),
    ]);
    return {
      results: {
        issue: issues.map((i: any) => ({
          id: i.id,
          name: i.name,
          sequence_id: i.sequenceId,
          project_id: i.project?.id,
          project__identifier: i.project?.identifier,
          workspace__slug: ws.slug,
          legacy_ticket_number: i.legacyTicketNumber ?? null,
          is_intake: i.state?.group === "triage",
          type_id: null,
        })),
        project: projects.map((p: any) => ({id: p.id, name: p.name, identifier: p.identifier, workspace__slug: ws.slug})),
        page: [],
        cycle: [],
        module: [],
        workspace: [],
        issue_view: [],
      },
    };
  })

  // ── Global search (full-text, fuzzy, error-tolerant) ──────────────────────

  .get("/:slug/global-search/", async ({params: {slug}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    // The web client sends `?q=`; older callers used `?query=`. Accept both.
    const q = (((query.q ?? query.query) as string) ?? "").trim();
    if (!q) return {results: {issues: [], intakes: [], projects: [], pages: [], cycles: [], modules: []}};

    // ── Issues + intakes: native Postgres full-text + trigram search ──────────
    // - websearch_to_tsquery over a stemmed, accent-folded document (title +
    //   description + legacy number) handles natural-language queries.
    // - pg_trgm `%` / similarity() add typo & transposition tolerance.
    // - comment bodies are matched through an EXISTS sub-query.
    // Ranking blends ts_rank with trigram similarity; the planner uses the GIN
    // indexes created by ensureSearchIndexes().
    type IssueRow = {
      id: string;
      name: string;
      sequence_id: number;
      priority: string;
      legacy_ticket_number: string | null;
      state_group: string | null;
      state_name: string | null;
      project_id: string | null;
      project_identifier: string | null;
      project_name: string | null;
    };

    const ftsDoc = Prisma.raw(ISSUE_FTS_DOC_I);
    const commentDoc = Prisma.raw(COMMENT_FTS_DOC_C);
    const cfg = Prisma.raw(`'${PT_FTS_CONFIG}'`);

    const issueRowsP = prisma.$queryRaw<IssueRow[]>(Prisma.sql`
      SELECT i.id, i.name, i.sequence_id, i.priority, i.legacy_ticket_number,
             s."group" AS state_group, s.name AS state_name,
             p.id AS project_id, p.identifier AS project_identifier, p.name AS project_name
      FROM issues i
      LEFT JOIN states s ON s.id = i.state_id
      LEFT JOIN projects p ON p.id = i.project_id
      WHERE i.workspace_id = ${ws.id}::uuid
        AND i.deleted_at IS NULL
        AND i.is_draft = false
        AND (
          ${ftsDoc} @@ websearch_to_tsquery(${cfg}, ${q})
          OR i.name % ${q}
          OR i.legacy_ticket_number ILIKE '%' || ${q} || '%'
          OR EXISTS (
            SELECT 1 FROM issue_comments c
            WHERE c.issue_id = i.id AND c.deleted_at IS NULL
              AND (${commentDoc} @@ websearch_to_tsquery(${cfg}, ${q}) OR c.comment_stripped % ${q})
          )
        )
      ORDER BY (
        ts_rank(${ftsDoc}, websearch_to_tsquery(${cfg}, ${q})) * 2
        + GREATEST(similarity(i.name, ${q}), similarity(coalesce(i.legacy_ticket_number,''), ${q}))
      ) DESC, i.updated_at DESC
      LIMIT 40
    `);

    const [issueRows, projects, pages, cycles, modules] = await Promise.all([
      issueRowsP,
      prisma.project.findMany({
        where: {workspaceId: ws.id, deletedAt: null, name: {contains: q, mode: "insensitive"}},
        select: {id: true, name: true, identifier: true},
        take: 5,
      }),
      prisma.page.findMany({
        where: {workspaceId: ws.id, deletedAt: null, name: {contains: q, mode: "insensitive"}},
        select: {id: true, name: true},
        take: 5,
      }),
      prisma.cycle.findMany({
        where: {workspaceId: ws.id, deletedAt: null, name: {contains: q, mode: "insensitive"}},
        select: {id: true, name: true, projectId: true},
        take: 5,
      }),
      prisma.module.findMany({
        where: {workspaceId: ws.id, deletedAt: null, name: {contains: q, mode: "insensitive"}},
        select: {id: true, name: true, projectId: true},
        take: 5,
      }),
    ]);

    const toProject = (r: IssueRow) => (r.project_id ? {id: r.project_id, identifier: r.project_identifier, name: r.project_name} : null);

    const intakes = issueRows.filter((r) => r.state_group === "triage");
    const workItems = issueRows.filter((r) => r.state_group !== "triage");

    return {
      results: {
        issues: workItems.slice(0, 15).map((r) => ({
          id: r.id,
          name: r.name,
          type: "issue",
          sequence_id: r.sequence_id,
          legacy_ticket_number: r.legacy_ticket_number ?? null,
          priority: r.priority,
          state: r.state_name ? {name: r.state_name, group: r.state_group} : null,
          project: toProject(r),
        })),
        intakes: intakes.slice(0, 8).map((r) => ({
          id: r.id,
          name: r.name,
          type: "intake",
          legacy_ticket_number: r.legacy_ticket_number ?? null,
          project: toProject(r),
        })),
        projects: projects.map((p: any) => ({...p, type: "project"})),
        pages: pages.map((p: any) => ({...p, type: "page"})),
        cycles: cycles.map((c: any) => ({...c, type: "cycle"})),
        modules: modules.map((m: any) => ({...m, type: "module"})),
      },
    };
  })

  // ── Search index maintenance ──────────────────────────────────────────────
  // Idempotently (re)creates the FTS extensions, the pt_unaccent config and the
  // GIN indexes, then refreshes planner statistics. Requires workspace admin.
  .post("/:slug/search/reindex/", async ({params: {slug}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const result = await ensureSearchIndexes(true);
    return result;
  })

  // ── Workspace slug check ──────────────────────────────────────────────────────

  .get("/workspace-slug-check/", async ({query, set}) => {
    const slug = (query.slug as string | undefined)?.toLowerCase();
    if (!slug) {
      set.status = 400;
      return {error: "slug is required."};
    }
    const RESTRICTED = ["admin", "api", "auth", "plane", "god-mode", "spaces", "home", "login", "signup", "settings"];
    const taken = RESTRICTED.includes(slug) || (await prisma.workspace.findFirst({where: {slug}})) !== null;
    return {status: !taken};
  })

  // ── Invitations: specific invite management ────────────────────────────────

  .get("/:slug/invitations/:pk/", async ({params: {slug, pk}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const invite = await prisma.workspaceMemberInvite.findUnique({where: {id: pk}});
    if (!invite) {
      set.status = 404;
      return {detail: "Not found."};
    }
    return invite;
  })

  .patch("/:slug/invitations/:pk/", async ({params: {slug, pk}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const b = body as any;
    const data: any = {};
    if (b.role !== undefined) data.role = b.role;
    return prisma.workspaceMemberInvite.update({where: {id: pk}, data});
  })

  .post("/:slug/invitations/:pk/join/", async ({params: {slug, pk}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    const invite = await prisma.workspaceMemberInvite.findUnique({where: {id: pk}});
    if (!invite) {
      set.status = 400;
      return {detail: "Invalid invitation."};
    }
    if (invite.email !== user.email) {
      set.status = 400;
      return {detail: "Invitation is not for this email."};
    }

    await prisma.$transaction(async (tx) => {
      await tx.workspaceMemberInvite.update({where: {id: invite.id}, data: {accepted: true}});
      const existing = await tx.workspaceMember.findFirst({
        where: {workspaceId: ws.id, memberId: user.id, deletedAt: null},
      });
      if (!existing) {
        await tx.workspaceMember.create({
          data: {workspaceId: ws.id, memberId: user.id, role: invite.role, isActive: true},
        });
      }
    });
    return {detail: "Joined workspace."};
  })

  // ── Members: specific member management ────────────────────────────────────

  .get("/:slug/members/", async ({params: {slug}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const members = await prisma.workspaceMember.findMany({
      where: {workspaceId: ws.id, isActive: true, deletedAt: null},
      include: {
        member: {select: {id: true, email: true, firstName: true, lastName: true, displayName: true, avatar: true, avatarUrl: true}},
      },
      orderBy: {createdAt: "asc"},
    });
    return members.map((m) => ({
      id: m.id,
      member: {
        id: m.member.id,
        email: m.member.email,
        display_name: m.member.displayName,
        avatar: m.member.avatar ?? "",
        avatar_url: m.member.avatarUrl ?? null,
        first_name: m.member.firstName,
        last_name: m.member.lastName,
        is_bot: false,
      },
      role: m.role,
      is_active: m.isActive,
      created_at: m.createdAt.toISOString(),
    }));
  })

  .get("/:slug/members/:pk/", async ({params: {slug, pk}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const m = await prisma.workspaceMember.findFirst({
      where: {workspaceId: ws.id, memberId: pk, deletedAt: null},
      include: {member: {select: {id: true, email: true, firstName: true, lastName: true, displayName: true, avatar: true}}},
    });
    if (!m) {
      set.status = 404;
      return {detail: "Not found."};
    }
    return m;
  })

  .patch("/:slug/members/:pk/", async ({params: {slug, pk}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    const caller = await requireWorkspaceWriter(ws.id, user.id);
    if (caller.role < 20) {
      set.status = 403;
      return {detail: "Only admins can change member roles."};
    }
    const b = body as any;
    const data: any = {};
    if (b.role !== undefined) data.role = parseInt(b.role, 10);
    return prisma.workspaceMember.updateMany({where: {workspaceId: ws.id, memberId: pk}, data});
  })

  .delete("/:slug/members/:pk/", async ({params: {slug, pk}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    const caller = await requireWorkspaceWriter(ws.id, user.id);
    if (caller.role < 20) {
      set.status = 403;
      return {detail: "Only admins can remove members."};
    }
    await prisma.workspaceMember.updateMany({
      where: {workspaceId: ws.id, memberId: pk},
      data: {isActive: false, deletedAt: new Date()},
    });
    set.status = 204;
    return null;
  })

  // Admin-only: reset another member's password to a known value. Clears
  // isPasswordAutoset so the seeder won't overwrite it on the next restart, and
  // echoes the password back so the admin can hand it to the user.
  .post("/:slug/members/:pk/reset-password/", async ({params: {slug, pk}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    const caller = await requireWorkspaceWriter(ws.id, user.id);
    if (caller.role < 20) {
      set.status = 403;
      return {detail: "Apenas administradores podem redefinir senhas."};
    }
    const target = await prisma.workspaceMember.findFirst({
      where: {workspaceId: ws.id, memberId: pk, deletedAt: null},
      select: {member: {select: {id: true, isInstanceAdmin: true}}},
    });
    if (!target?.member) {
      set.status = 404;
      return {detail: "Membro não encontrado."};
    }
    // A workspace admin must not reset an instance admin's password (only the
    // instance admin themselves can change it, via account settings).
    if (target.member.isInstanceAdmin && target.member.id !== user.id) {
      set.status = 403;
      return {detail: "Não é possível redefinir a senha de um administrador da instância."};
    }
    const b = (body as any) ?? {};
    const newPassword = typeof b.password === "string" && b.password.trim().length > 0 ? b.password : "teste";
    if (newPassword.length < 4) {
      set.status = 400;
      return {detail: "A senha precisa ter ao menos 4 caracteres."};
    }
    const hash = await Bun.password.hash(newPassword, {algorithm: "bcrypt", cost: 12});
    await prisma.user.update({
      where: {id: pk},
      data: {password: hash, isPasswordAutoset: false, isActive: true},
    });
    return {detail: "Senha redefinida com sucesso.", password: newPassword};
  })

  .post("/:slug/members/leave/", async ({params: {slug}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await prisma.workspaceMember.updateMany({
      where: {workspaceId: ws.id, memberId: user.id},
      data: {isActive: false, deletedAt: new Date()},
    });
    set.status = 204;
    return null;
  })

  // ── S3 storage configuration (instance-wide) ──────────────────────────────
  // Stored on the Instance row (configurations.s3). The secret key is never
  // returned — the GET only reports whether one is set.
  .get("/:slug/storage-config/", async ({params: {slug}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    const caller = await requireWorkspaceMember(ws.id, user.id);
    if (caller.role < 20) {
      set.status = 403;
      return {detail: "Apenas administradores podem ver a configuração de armazenamento."};
    }
    const instance = await prisma.instance.findFirst({select: {configurations: true}});
    const cfg = ((instance?.configurations as any)?.s3 ?? {}) as S3Config;
    const isConfigured = Boolean(cfg.endpoint && cfg.bucket && cfg.access_key && cfg.secret_key);
    return {
      provider: isConfigured ? "s3" : "local",
      endpoint: cfg.endpoint ?? "",
      region: cfg.region ?? "",
      bucket: cfg.bucket ?? "",
      access_key: cfg.access_key ?? "",
      has_secret_key: Boolean(cfg.secret_key),
      is_configured: isConfigured,
    };
  })

  .patch("/:slug/storage-config/", async ({params: {slug}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    const caller = await requireWorkspaceMember(ws.id, user.id);
    if (caller.role < 20) {
      set.status = 403;
      return {detail: "Apenas administradores podem alterar a configuração de armazenamento."};
    }
    const b = (body as any) ?? {};
    const instance = await prisma.instance.findFirst();
    if (!instance) {
      set.status = 400;
      return {detail: "Instância não configurada."};
    }
    const configurations = (instance.configurations as any) ?? {};
    const current = (configurations.s3 ?? {}) as S3Config;

    // Empty/omitted secret keeps the existing one (so the admin needn't re-type it).
    const provider = b.provider === "local" ? "local" : "s3";
    const next: S3Config =
      provider === "local"
        ? {}
        : {
            endpoint: String(b.endpoint ?? current.endpoint ?? "").trim(),
            region: String(b.region ?? current.region ?? "").trim(),
            bucket: String(b.bucket ?? current.bucket ?? "").trim(),
            access_key: String(b.access_key ?? current.access_key ?? "").trim(),
            secret_key:
              typeof b.secret_key === "string" && b.secret_key.trim().length > 0
                ? b.secret_key.trim()
                : (current.secret_key ?? ""),
          };

    if (provider === "s3" && (!next.endpoint || !next.bucket || !next.access_key || !next.secret_key)) {
      set.status = 400;
      return {detail: "Para usar S3 informe endpoint, bucket, access key e secret key."};
    }

    configurations.s3 = next;
    await prisma.instance.update({where: {id: instance.id}, data: {configurations}});
    invalidateStorageCache();
    return {detail: "Configuração de armazenamento salva.", provider, is_configured: provider === "s3"};
  })

  // ── Chat plugin config (enable + plugin API/WS URL) ───────────────────────
  // Stored on Instance.configurations.chat. The chat plugin is shipped
  // installed-but-disabled; enabling it here points the UI at the chat backend.
  .get("/:slug/chat-config/", async ({params: {slug}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const instance = await prisma.instance.findFirst({select: {configurations: true}});
    const cfg = ((instance?.configurations as any)?.chat ?? {}) as any;
    return {
      enabled: Boolean(cfg.enabled),
      api_url: cfg.api_url ?? "",
      ws_url: cfg.ws_url ?? "",
    };
  })
  .patch("/:slug/chat-config/", async ({params: {slug}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    const caller = await requireWorkspaceMember(ws.id, user.id);
    if (caller.role < 20) {
      set.status = 403;
      return {detail: "Apenas administradores podem alterar a configuração do chat."};
    }
    const b = (body as any) ?? {};
    const instance = await prisma.instance.findFirst();
    if (!instance) {
      set.status = 400;
      return {detail: "Instância não configurada."};
    }
    const configurations = (instance.configurations as any) ?? {};
    const current = (configurations.chat ?? {}) as any;
    configurations.chat = {
      enabled: b.enabled !== undefined ? Boolean(b.enabled) : Boolean(current.enabled),
      api_url: b.api_url !== undefined ? String(b.api_url).trim() : (current.api_url ?? ""),
      ws_url: b.ws_url !== undefined ? String(b.ws_url).trim() : (current.ws_url ?? ""),
    };
    await prisma.instance.update({where: {id: instance.id}, data: {configurations}});
    return {detail: "Configuração do chat salva.", ...configurations.chat};
  })

  .get("/:slug/workspace-members/me/", async ({params: {slug}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    const m = await prisma.workspaceMember.findFirst({
      where: {workspaceId: ws.id, memberId: user.id, deletedAt: null},
    });
    if (!m) {
      set.status = 404;
      return {detail: "Not a member."};
    }
    return {
      id: m.id,
      member: m.memberId,
      role: m.role,
      workspace: m.workspaceId,
      company_role: m.companyRole ?? null,
      is_active: m.isActive,
      created_at: m.createdAt.toISOString(),
      updated_at: m.updatedAt.toISOString(),
      created_by: m.memberId,
      updated_by: m.memberId,
      view_props: {},
      default_props: {},
      draft_issue_count: 0,
    };
  })

  .get("/:slug/project-members/", async ({params: {slug}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const projectId = query.project_id as string | undefined;
    const where: any = {workspaceId: ws.id, isActive: true, deletedAt: null};
    if (projectId) where.projectId = projectId;
    return paginate({
      query: (skip, take) =>
        prisma.projectMember.findMany({
          where,
          skip,
          take,
          include: {member: {select: {id: true, email: true, displayName: true, avatar: true}}},
        }),
      count: () => prisma.projectMember.count({where}),
      cursor: query.cursor as string | undefined,
    });
  })

  // ── Workspace labels / states ─────────────────────────────────────────────────

  .get("/:slug/labels/", async ({params: {slug}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return prisma.label.findMany({
      where: {workspaceId: ws.id, deletedAt: null},
      orderBy: {name: "asc"},
    });
  })

  .get("/:slug/states/", async ({params: {slug}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return prisma.state.findMany({
      where: {workspaceId: ws.id, deletedAt: null},
      orderBy: {sequence: "asc"},
    });
  })

  // ── Workspace-level label SLA config ─────────────────────────────────────────
  // Labels are project-scoped, but their SLA (deadline) is managed once at the
  // workspace level: labels are aggregated by name across all projects.
  .get("/:slug/label-sla/", async ({params: {slug}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const labels = await prisma.label.findMany({
      where: {workspaceId: ws.id, deletedAt: null},
      select: {name: true, color: true, slaHours: true},
    });
    const byName = new Map<string, {name: string; color: string; sla_hours: number | null; project_count: number}>();
    for (const l of labels) {
      const cur = byName.get(l.name);
      if (cur) cur.project_count++;
      else byName.set(l.name, {name: l.name, color: l.color ?? "", sla_hours: l.slaHours ?? null, project_count: 1});
    }
    return {labels: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))};
  })

  // Update SLA (and color) by label name across every project in the workspace.
  .put("/:slug/label-sla/", async ({params: {slug}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    const m = await requireWorkspaceMember(ws.id, user.id);
    if (m.role < 18) {
      set.status = 403;
      return {detail: "Apenas administradores podem configurar SLA de etiquetas."};
    }
    const rows: any[] = (body as any)?.labels ?? [];
    for (const r of rows) {
      if (!r?.name) continue;
      const data: any = {};
      if (r.sla_hours === null || typeof r.sla_hours === "number") data.slaHours = r.sla_hours;
      if (typeof r.color === "string" && r.color) data.color = r.color;
      if (Object.keys(data).length) {
        await prisma.label.updateMany({where: {workspaceId: ws.id, name: r.name, deletedAt: null}, data});
      }
    }
    return {ok: true};
  })

  // ── User issue properties (filters) ─────────────────────────────────────────

  .get("/:slug/user-properties/", async ({params: {slug}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const props = await prisma.workspaceUserProperties.findUnique({
      where: {workspaceId_userId: {workspaceId: ws.id, userId: user.id}},
    });
    return props ?? {filters: {}, display_filters: {}, display_properties: {}};
  })

  .patch("/:slug/user-properties/", async ({params: {slug}, body, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    return prisma.workspaceUserProperties.upsert({
      where: {workspaceId_userId: {workspaceId: ws.id, userId: user.id}},
      update: {
        ...(b.filters !== undefined && {filters: b.filters}),
        ...(b.display_filters !== undefined && {displayFilters: b.display_filters}),
        ...(b.display_properties !== undefined && {displayProperties: b.display_properties}),
      },
      create: {
        workspaceId: ws.id,
        userId: user.id,
        filters: b.filters ?? {},
        displayFilters: b.display_filters ?? {},
        displayProperties: b.display_properties ?? {},
      },
    });
  })

  // ── Workspace modules / cycles ────────────────────────────────────────────────

  .get("/:slug/modules/", async ({params: {slug}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return paginate({
      query: (skip, take) =>
        prisma.module.findMany({
          where: {workspaceId: ws.id, deletedAt: null},
          skip,
          take,
          include: {project: {select: {id: true, name: true, identifier: true}}},
          orderBy: {createdAt: "desc"},
        }),
      count: () => prisma.module.count({where: {workspaceId: ws.id, deletedAt: null}}),
      cursor: query.cursor as string | undefined,
    });
  })

  .get("/:slug/cycles/", async ({params: {slug}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return paginate({
      query: (skip, take) =>
        prisma.cycle.findMany({
          where: {workspaceId: ws.id, deletedAt: null},
          skip,
          take,
          include: {project: {select: {id: true, name: true, identifier: true}}},
          orderBy: {createdAt: "desc"},
        }),
      count: () => prisma.cycle.count({where: {workspaceId: ws.id, deletedAt: null}}),
      cursor: query.cursor as string | undefined,
    });
  })

  // ── Favorites: patch / group ──────────────────────────────────────────────────

  .patch("/:slug/favorites/:favorite_id/", async ({params: {slug, favorite_id}, body, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    const data: any = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.entity_type !== undefined) data.entityType = b.entity_type;
    if (b.sequence !== undefined) data.sequence = b.sequence;
    return prisma.userFavorite.update({where: {id: favorite_id}, data});
  })

  .patch("/:slug/favorites/:favorite_id/group/", async ({params: {slug, favorite_id}, body, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    return prisma.userFavorite.update({
      where: {id: favorite_id},
      data: {...(b.parent !== undefined && {parentId: b.parent})},
    });
  })

  // ── Draft issues ──────────────────────────────────────────────────────────────

  .get("/:slug/draft-issues/", async ({params: {slug}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where = {workspaceId: ws.id, createdById: user.id, deletedAt: null};
    return paginate({
      query: (skip, take) => prisma.draftIssue.findMany({where, skip, take, orderBy: {createdAt: "desc"}}),
      count: () => prisma.draftIssue.count({where}),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/:slug/draft-issues/", async ({params: {slug}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    const draft = await prisma.draftIssue.create({
      data: {
        projectId: b.project_id,
        workspaceId: ws.id,
        name: b.name ?? "Untitled",
        createdById: user.id,
        priority: b.priority ?? "none",
        stateId: b.state ?? null,
        descriptionHtml: b.description_html ?? "<p></p>",
      },
    });
    set.status = 201;
    return draft;
  })

  .get("/:slug/draft-issues/:pk/", async ({params: {slug, pk}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const draft = await prisma.draftIssue.findFirst({where: {id: pk, workspaceId: ws.id, deletedAt: null}});
    if (!draft) {
      set.status = 404;
      return {detail: "Not found."};
    }
    return draft;
  })

  .patch("/:slug/draft-issues/:pk/", async ({params: {slug, pk}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    const data: any = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.priority !== undefined) data.priority = b.priority;
    if (b.state !== undefined) data.stateId = b.state;
    if (b.description_html !== undefined) data.descriptionHtml = b.description_html;
    return prisma.draftIssue.update({where: {id: pk}, data});
  })

  .delete("/:slug/draft-issues/:pk/", async ({params: {slug, pk}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    await prisma.draftIssue.update({where: {id: pk}, data: {deletedAt: new Date()}});
    set.status = 204;
    return null;
  })

  .post("/:slug/draft-to-issue/:draft_id/", async ({params: {slug, draft_id}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const draft = await prisma.draftIssue.findFirst({where: {id: draft_id, workspaceId: ws.id, deletedAt: null}});
    if (!draft) {
      set.status = 404;
      return {detail: "Draft not found."};
    }

    const project = await prisma.project.findFirst({where: {id: draft.projectId, deletedAt: null}});
    if (!project) {
      set.status = 400;
      return {detail: "Project not found."};
    }

    const issue = await prisma.$transaction(async (tx) => {
      const sequenceId = await nextSequenceId(tx, draft.projectId);
      const i = await tx.issue.create({
        data: {
          projectId: draft.projectId,
          workspaceId: ws.id,
          name: draft.name,
          priority: draft.priority,
          stateId: draft.stateId,
          descriptionHtml: draft.descriptionHtml,
          createdById: user.id,
          isDraft: false,
          sequenceId,
        },
      });
      await tx.draftIssue.update({where: {id: draft_id}, data: {deletedAt: new Date()}});
      return i;
    });
    set.status = 201;
    return issue;
  })

  // ── Dashboard (home widgets) ──────────────────────────────────────────────────

  .get("/:slug/dashboard/", async ({params: {slug}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);

    const dashboardId = `${ws.id}-home`;
    const DEFAULT_WIDGETS = [
      {id: `${dashboardId}-overview`, key: "overview_stats", is_visible: true, widget_filters: {}, filters: {}},
      {id: `${dashboardId}-assigned`, key: "assigned_issues", is_visible: true, widget_filters: {duration: "this_week"}, filters: {}},
      {id: `${dashboardId}-created`, key: "created_issues", is_visible: true, widget_filters: {duration: "this_week"}, filters: {}},
      {id: `${dashboardId}-state`, key: "issues_by_state_groups", is_visible: true, widget_filters: {duration: "this_week"}, filters: {}},
      {id: `${dashboardId}-priority`, key: "issues_by_priority", is_visible: true, widget_filters: {duration: "this_week"}, filters: {}},
      {id: `${dashboardId}-activity`, key: "recent_activity", is_visible: true, widget_filters: {}, filters: {}},
      {id: `${dashboardId}-projects`, key: "recent_projects", is_visible: true, widget_filters: {}, filters: {}},
      {id: `${dashboardId}-collab`, key: "recent_collaborators", is_visible: true, widget_filters: {}, filters: {}},
    ];
    return {id: dashboardId, name: "Home", widgets: DEFAULT_WIDGETS};
  })

  .get("/:slug/dashboard/:dashboard_id/", async ({params: {slug, dashboard_id}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);

    const widgetKey = (query.widget_key as string) ?? "";
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);

    // Overview stats
    if (widgetKey === "overview_stats") {
      const userProjectIds = (
        await prisma.projectMember.findMany({
          where: {workspaceId: ws.id, memberId: user.id, isActive: true, deletedAt: null},
          select: {projectId: true},
        })
      ).map((m) => m.projectId);
      const [total, completed, pending, overdue] = await Promise.all([
        prisma.issue.count({where: {workspaceId: ws.id, projectId: {in: userProjectIds}, deletedAt: null, isDraft: false}}),
        prisma.issue.count({
          where: {workspaceId: ws.id, projectId: {in: userProjectIds}, deletedAt: null, isDraft: false, state: {group: "completed"}},
        }),
        prisma.issue.count({
          where: {
            workspaceId: ws.id,
            projectId: {in: userProjectIds},
            deletedAt: null,
            isDraft: false,
            state: {group: {in: ["backlog", "unstarted", "started"]}},
          },
        }),
        prisma.issue.count({
          where: {
            workspaceId: ws.id,
            projectId: {in: userProjectIds},
            deletedAt: null,
            isDraft: false,
            targetDate: {lt: now},
            completedAt: null,
            state: {group: {notIn: ["completed", "cancelled"]}},
          },
        }),
      ]);
      return {total_issues: total, completed_issues: completed, pending_issues: pending, overdue_issues: overdue};
    }

    // Assigned issues
    if (widgetKey === "assigned_issues") {
      const issues = await prisma.issue.findMany({
        where: {
          workspaceId: ws.id,
          deletedAt: null,
          isDraft: false,
          completedAt: null,
          assignees: {some: {assigneeId: user.id, deletedAt: null}},
        },
        include: {
          state: {select: {name: true, group: true, color: true}},
          assignees: {select: {assigneeId: true}},
          labels: {select: {labelId: true}},
        },
        orderBy: {updatedAt: "desc"},
        take: 10,
      });
      return {issues: issues.map(serializeIssue), total_count: issues.length, next_page_results: false};
    }

    // Created issues
    if (widgetKey === "created_issues") {
      const issues = await prisma.issue.findMany({
        where: {workspaceId: ws.id, deletedAt: null, isDraft: false, createdById: user.id},
        include: {
          state: {select: {name: true, group: true, color: true}},
          assignees: {select: {assigneeId: true}},
          labels: {select: {labelId: true}},
        },
        orderBy: {updatedAt: "desc"},
        take: 10,
      });
      return {issues: issues.map(serializeIssue), total_count: issues.length, next_page_results: false};
    }

    // Issues by state groups
    if (widgetKey === "issues_by_state_groups") {
      const groups = await prisma.issue.groupBy({
        by: ["stateId"],
        where: {workspaceId: ws.id, deletedAt: null, isDraft: false, assignees: {some: {assigneeId: user.id, deletedAt: null}}},
        _count: true,
      });
      const stateIds = groups.map((g) => g.stateId).filter(Boolean) as string[];
      const states = await prisma.state.findMany({where: {id: {in: stateIds}}, select: {id: true, group: true}});
      const stateGroupMap = Object.fromEntries(states.map((s) => [s.id, s.group]));
      const groupCounts: Record<string, number> = {backlog: 0, unstarted: 0, started: 0, completed: 0, cancelled: 0};
      for (const g of groups) {
        const grp = g.stateId ? (stateGroupMap[g.stateId] ?? "backlog") : "backlog";
        groupCounts[grp] = (groupCounts[grp] ?? 0) + g._count;
      }
      return {data: Object.entries(groupCounts).map(([state, count]) => ({state, count}))};
    }

    // Issues by priority
    if (widgetKey === "issues_by_priority") {
      const groups = await prisma.issue.groupBy({
        by: ["priority"],
        where: {workspaceId: ws.id, deletedAt: null, isDraft: false, assignees: {some: {assigneeId: user.id, deletedAt: null}}},
        _count: true,
      });
      return {data: groups.map((g) => ({priority: g.priority, count: g._count}))};
    }

    // Recent activity
    if (widgetKey === "recent_activity") {
      const activities = await prisma.issueActivity.findMany({
        where: {workspaceId: ws.id, actorId: user.id},
        orderBy: {createdAt: "desc"},
        take: 10,
      });
      return {
        results: activities.map((a) => ({
          id: a.id,
          actor: a.actorId,
          issue: a.issueId,
          project: a.projectId,
          workspace: a.workspaceId,
          verb: a.verb,
          field: a.field,
          old_value: a.oldValue,
          new_value: a.newValue,
          created_at: a.createdAt?.toISOString(),
        })),
      };
    }

    // Recent projects
    if (widgetKey === "recent_projects") {
      const members = await prisma.projectMember.findMany({
        where: {workspaceId: ws.id, memberId: user.id, isActive: true, deletedAt: null},
        include: {project: {select: {id: true, name: true, identifier: true, iconProp: true}}},
        orderBy: {updatedAt: "desc"},
        take: 5,
      });
      return {
        results: members.map((m) => ({
          id: m.project.id,
          name: m.project.name,
          identifier: m.project.identifier,
          icon_prop: m.project.iconProp,
        })),
      };
    }

    // Recent collaborators
    if (widgetKey === "recent_collaborators") {
      const userProjectIds = (
        await prisma.projectMember.findMany({
          where: {workspaceId: ws.id, memberId: user.id, isActive: true, deletedAt: null},
          select: {projectId: true},
        })
      ).map((m) => m.projectId);
      const coworkers = await prisma.projectMember.findMany({
        where: {workspaceId: ws.id, projectId: {in: userProjectIds}, isActive: true, deletedAt: null, memberId: {not: user.id}},
        include: {member: {select: {id: true, displayName: true, avatar: true, avatarUrl: true}}},
        distinct: ["memberId"],
        take: 8,
      });
      return {
        collaborators: coworkers.map((m) => ({
          id: m.member.id,
          display_name: m.member.displayName,
          avatar: m.member.avatar,
          avatar_url: m.member.avatarUrl,
          issues_count: 0,
        })),
      };
    }

    return {data: []};
  })

  // ── Home preferences ──────────────────────────────────────────────────────────

  .get("/:slug/home-preferences/", async ({params: {slug}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);

    const DEFAULT_WIDGETS = [
      {key: "my_work_items", name: "Meus Work Items", is_enabled: true, sort_order: 7},
      {key: "upcoming_dates", name: "Prazos Próximos", is_enabled: true, sort_order: 6},
      {key: "open_intakes", name: "Intakes Abertos", is_enabled: true, sort_order: 5},
      {key: "quick_links", name: "Links Rápidos", is_enabled: true, sort_order: 4},
      {key: "recents", name: "Recentes", is_enabled: true, sort_order: 3},
      {key: "my_stickies", name: "Meus Stickies", is_enabled: true, sort_order: 2},
      {key: "quick_tutorial", name: "Tutorial", is_enabled: true, sort_order: 1},
      {key: "new_at_plane", name: "Novidades", is_enabled: true, sort_order: 0},
    ];

    const props = await prisma.workspaceUserProperties.findFirst({
      where: {workspaceId: ws.id, userId: user.id},
      select: {displayFilters: true},
    });
    const widgetPrefs: Record<string, any> = (props?.displayFilters as any)?.widget_preferences ?? {};

    return DEFAULT_WIDGETS.map((w) => ({
      ...w,
      is_enabled: widgetPrefs[w.key]?.is_enabled ?? w.is_enabled,
      sort_order: widgetPrefs[w.key]?.sort_order ?? w.sort_order,
    }));
  })

  .patch("/:slug/home-preferences/", async ({params: {slug}, body, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return {detail: "Preferences updated."};
  })

  .get("/:slug/home-preferences/:key/", async ({params: {slug, key}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return {key, value: null};
  })

  .patch("/:slug/home-preferences/:key/", async ({params: {slug, key}, body, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    const props = await prisma.workspaceUserProperties.findFirst({
      where: {workspaceId: ws.id, userId: user.id},
    });
    const existing = (props?.displayFilters as any) ?? {};
    const widgetPrefs = existing.widget_preferences ?? {};
    widgetPrefs[key] = {...(widgetPrefs[key] ?? {}), ...b};
    const newDisplayFilters = {...existing, widget_preferences: widgetPrefs};
    await prisma.workspaceUserProperties.upsert({
      where: {workspaceId_userId: {workspaceId: ws.id, userId: user.id}},
      update: {displayFilters: newDisplayFilters},
      create: {workspaceId: ws.id, userId: user.id, displayFilters: newDisplayFilters},
    });
    return {key, ...b};
  })

  // ── Quick links ───────────────────────────────────────────────────────────────

  .get("/:slug/quick-links/", async ({params: {slug}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const quickLinks = await getWorkspaceQuickLinks(ws.id, user.id);
    return quickLinks.map((link) => serializeQuickLink(ws.slug, link));
  })

  .post("/:slug/quick-links/", async ({params: {slug}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    if (!b.url) {
      set.status = 400;
      return {error: "URL is required."};
    }

    const url = normalizeQuickLinkUrl(String(b.url));
    const quickLinks = await getWorkspaceQuickLinks(ws.id, user.id);
    if (quickLinks.some((link) => link.url === url)) {
      set.status = 400;
      return {error: "URL already exists for this workspace and owner"};
    }

    const newLink: QuickLinkRecord = {
      id: randomUUID(),
      title: String(b.title ?? ""),
      url,
      metadata: (b.metadata as Record<string, unknown>) ?? {},
      workspace_slug: ws.slug,
      created_by_id: user.id,
      created_at: new Date().toISOString(),
    };

    await saveWorkspaceQuickLinks(ws.id, user.id, [newLink, ...quickLinks]);
    set.status = 201;
    return serializeQuickLink(ws.slug, newLink);
  })

  .get("/:slug/quick-links/:pk/", async ({params: {slug, pk}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const quickLinks = await getWorkspaceQuickLinks(ws.id, user.id);
    const quickLink = quickLinks.find((link) => link.id === pk);
    if (!quickLink) {
      set.status = 404;
      return {error: "Quick link not found."};
    }
    return serializeQuickLink(ws.slug, quickLink);
  })

  .patch("/:slug/quick-links/:pk/", async ({params: {slug, pk}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    const quickLinks = await getWorkspaceQuickLinks(ws.id, user.id);
    const currentLink = quickLinks.find((link) => link.id === pk);
    if (!currentLink) {
      set.status = 404;
      return {error: "Quick link not found."};
    }

    const nextUrl = b.url !== undefined ? normalizeQuickLinkUrl(String(b.url)) : currentLink.url;
    if (quickLinks.some((link) => link.id !== pk && link.url === nextUrl)) {
      set.status = 400;
      return {error: "URL already exists for this workspace and owner"};
    }

    const updatedLink: QuickLinkRecord = {
      ...currentLink,
      title: b.title !== undefined ? String(b.title ?? "") : currentLink.title,
      url: nextUrl,
      metadata: b.metadata !== undefined ? (b.metadata as Record<string, unknown>) : currentLink.metadata,
    };
    const updatedLinks = quickLinks.map((link) => (link.id === pk ? updatedLink : link));

    await saveWorkspaceQuickLinks(ws.id, user.id, updatedLinks);
    return serializeQuickLink(ws.slug, updatedLink);
  })

  .delete("/:slug/quick-links/:pk/", async ({params: {slug, pk}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const quickLinks = await getWorkspaceQuickLinks(ws.id, user.id);
    const nextLinks = quickLinks.filter((link) => link.id !== pk);
    if (nextLinks.length === quickLinks.length) {
      set.status = 404;
      return {error: "Quick link not found."};
    }
    await saveWorkspaceQuickLinks(ws.id, user.id, nextLinks);
    set.status = 204;
    return null;
  })

  // ── Sidebar preferences ───────────────────────────────────────────────────────

  // Per-user sidebar navigation preferences (pinned items + order), persisted in
  // a WorkspaceSetting keyed by user. Map shape: { [key]: {key, is_pinned, sort_order} }.
  .get("/:slug/sidebar-preferences/", async ({params: {slug}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const setting = await prisma.workspaceSetting.findFirst({where: {workspaceId: ws.id, key: `sidebar_prefs:${user.id}`}});
    return (setting?.value as any) ?? {};
  })

  .patch("/:slug/sidebar-preferences/", async ({params: {slug}, body, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const settingKey = `sidebar_prefs:${user.id}`;
    const existing = await prisma.workspaceSetting.findFirst({where: {workspaceId: ws.id, key: settingKey}});
    const map: Record<string, any> = (existing?.value as any) ?? {};
    // Bulk: an array of {key, is_pinned, sort_order}.
    const items = Array.isArray(body) ? body : [];
    for (const it of items as any[]) {
      if (!it?.key) continue;
      map[it.key] = {...map[it.key], key: it.key, is_pinned: it.is_pinned, sort_order: it.sort_order};
    }
    await prisma.workspaceSetting.upsert({
      where: {workspaceId_key: {workspaceId: ws.id, key: settingKey}},
      create: {workspaceId: ws.id, key: settingKey, value: map},
      update: {value: map},
    });
    return map;
  })

  .patch("/:slug/sidebar-preferences/:key/", async ({params: {slug, key}, body, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const settingKey = `sidebar_prefs:${user.id}`;
    const existing = await prisma.workspaceSetting.findFirst({where: {workspaceId: ws.id, key: settingKey}});
    const map: Record<string, any> = (existing?.value as any) ?? {};
    const b = (body as any) ?? {};
    const item = {...map[key], key, ...(b.is_pinned !== undefined ? {is_pinned: b.is_pinned} : {}), ...(b.sort_order !== undefined ? {sort_order: b.sort_order} : {})};
    map[key] = item;
    await prisma.workspaceSetting.upsert({
      where: {workspaceId_key: {workspaceId: ws.id, key: settingKey}},
      create: {workspaceId: ws.id, key: settingKey, value: map},
      update: {value: map},
    });
    return item;
  })

  // ── User-favorites (alias for /favorites/ — Django uses this path) ───────────

  .get("/:slug/user-favorites/", async ({params: {slug}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where = {workspaceId: ws.id, userId: user.id, deletedAt: null};
    const favs = await prisma.userFavorite.findMany({where, orderBy: {sequence: "asc"}});
    return favs.map((f) => ({
      id: f.id,
      workspace: ws.id,
      entity_type: f.entityType,
      entity_identifier: f.entityId,
      name: f.name,
      parent: f.parentId,
      sequence: f.sequence,
      created_at: f.createdAt.toISOString(),
      updated_at: f.updatedAt.toISOString(),
    }));
  })

  .post("/:slug/user-favorites/", async ({params: {slug}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    const fav = await prisma.userFavorite.create({
      data: {
        workspaceId: ws.id,
        userId: user.id,
        entityType: b.entity_type,
        entityId: b.entity_id ?? b.entity_identifier,
        name: b.name ?? "",
        parentId: b.parent ?? null,
      },
    });
    set.status = 201;
    return {
      id: fav.id,
      workspace: ws.id,
      entity_type: fav.entityType,
      entity_identifier: fav.entityId,
      name: fav.name,
      parent: fav.parentId,
      sequence: fav.sequence,
    };
  })

  .patch("/:slug/user-favorites/:fav_id/", async ({params: {slug, fav_id}, body, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    const data: any = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.sequence !== undefined) data.sequence = b.sequence;
    if (b.parent !== undefined) data.parentId = b.parent;
    const fav = await prisma.userFavorite.update({where: {id: fav_id}, data});
    return {id: fav.id, workspace: ws.id, entity_type: fav.entityType, name: fav.name, sequence: fav.sequence};
  })

  .delete("/:slug/user-favorites/:fav_id/", async ({params: {slug, fav_id}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    await prisma.userFavorite.update({where: {id: fav_id}, data: {deletedAt: new Date()}});
    set.status = 204;
    return null;
  })

  // ── User profile page (profile + issue stats per user) ───────────────────────

  .get("/:slug/user-profile/:user_id/", async ({params: {slug, user_id}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const targetUser = await prisma.user.findFirst({where: {id: user_id}});
    if (!targetUser) return {project_data: [], user_data: null};

    const projects = await prisma.project.findMany({
      where: {workspaceId: ws.id, deletedAt: null, members: {some: {memberId: user.id, isActive: true, deletedAt: null}}},
      select: {id: true},
    });
    const projectIds = projects.map((p) => p.id);

    const projectData = await Promise.all(
      projectIds.map(async (pid) => {
        const [assigned, completed, created, pending] = await Promise.all([
          prisma.issueAssignee.count({where: {workspaceId: ws.id, projectId: pid, assigneeId: user_id, deletedAt: null}}),
          prisma.issue.count({
            where: {
              workspaceId: ws.id,
              projectId: pid,
              deletedAt: null,
              isDraft: false,
              state: {group: "completed"},
              assignees: {some: {assigneeId: user_id, deletedAt: null}},
            },
          }),
          prisma.issue.count({where: {workspaceId: ws.id, projectId: pid, deletedAt: null, isDraft: false, createdById: user_id}}),
          prisma.issue.count({
            where: {
              workspaceId: ws.id,
              projectId: pid,
              deletedAt: null,
              isDraft: false,
              state: {group: {in: ["backlog", "unstarted", "started"]}},
              assignees: {some: {assigneeId: user_id, deletedAt: null}},
            },
          }),
        ]);
        return {id: pid, assigned_issues: assigned, completed_issues: completed, created_issues: created, pending_issues: pending};
      }),
    );

    return {
      project_data: projectData,
      user_data: {
        email: targetUser.email,
        first_name: targetUser.firstName,
        last_name: targetUser.lastName,
        avatar_url: targetUser.avatarUrl ?? targetUser.avatar ?? null,
        cover_image_url: null,
        date_joined: targetUser.dateJoined.toISOString(),
        user_timezone: targetUser.userTimezone,
        display_name: targetUser.displayName,
      },
    };
  })

  // ── User stats ────────────────────────────────────────────────────────────────

  .get("/:slug/user-stats/:user_id/", async ({params: {slug, user_id}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where = {workspaceId: ws.id, deletedAt: null, isDraft: false, assignees: {some: {assigneeId: user_id, deletedAt: null}}};

    const [stateGroups, priorities, created, assigned, completed, pending, subscribed] = await Promise.all([
      prisma.issue.groupBy({by: ["stateId"], where, _count: {id: true}}).then(async (rows) => {
        const stateIds = rows.map((r) => r.stateId).filter(Boolean) as string[];
        const states = await prisma.state.findMany({where: {id: {in: stateIds}}, select: {id: true, group: true}});
        const groupMap: Record<string, number> = {};
        for (const r of rows) {
          const g = states.find((s) => s.id === r.stateId)?.group ?? "backlog";
          groupMap[g] = (groupMap[g] ?? 0) + r._count.id;
        }
        return Object.entries(groupMap).map(([state_group, state_count]) => ({state_group, state_count}));
      }),
      prisma.issue
        .groupBy({by: ["priority"], where, _count: {id: true}})
        .then((rows) => rows.map((r) => ({priority: r.priority, priority_count: r._count.id}))),
      prisma.issue.count({where: {workspaceId: ws.id, deletedAt: null, isDraft: false, createdById: user_id}}),
      prisma.issueAssignee.count({where: {workspaceId: ws.id, assigneeId: user_id, deletedAt: null}}),
      prisma.issue.count({where: {...where, state: {group: "completed"}}}),
      prisma.issue.count({where: {...where, state: {group: {in: ["backlog", "unstarted", "started"]}}}}),
      prisma.issueSubscriber.count({where: {workspaceId: ws.id, subscriberId: user_id}}),
    ]);

    return {
      state_distribution: stateGroups,
      priority_distribution: priorities,
      created_issues: created,
      assigned_issues: assigned,
      completed_issues: completed,
      pending_issues: pending,
      subscribed_issues: subscribed,
      present_cycles: [],
      upcoming_cycles: [],
    };
  })

  // ── User activity (paginated issue activities for a user) ─────────────────────

  .get("/:slug/user-activity/:user_id/", async ({params: {slug, user_id}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where = {workspaceId: ws.id, actorId: user_id};
    return paginate({
      query: (skip, take) => prisma.issueActivity.findMany({where, skip, take, orderBy: {createdAt: "desc"}}),
      count: () => prisma.issueActivity.count({where}),
      cursor: query.cursor as string | undefined,
      perPage: query.per_page ? Number(query.per_page) : 10,
    });
  })

  // ── User issues (for profile/my-issues board view) ────────────────────────────
  // Returns TIssuesResponse with paginated issues assigned to a specific user

  .get("/:slug/user-issues/:user_id/", async ({params: {slug, user_id}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);

    const orderBy = (query.order_by as string) ?? "-updated_at";
    const cursor = (query.cursor as string) ?? "100:0:0";
    const perPage = Number(query.per_page ?? 100);
    const layout = (query.layout as string) ?? "list";

    const parts = cursor.split(":").map(Number);
    const page = parts[1] ?? 0;
    const skip = page * perPage;

    const where: any = {
      workspaceId: ws.id,
      deletedAt: null,
      isDraft: false,
      assignees: {some: {assigneeId: user_id, deletedAt: null}},
    };

    const ISSUE_INCLUDE = {
      state: {select: {id: true, name: true, color: true, group: true}},
      assignees: {where: {deletedAt: null}, select: {assigneeId: true}},
      labels: {where: {deletedAt: null}, select: {labelId: true}},
    };

    // Convert snake_case order_by to camelCase for Prisma
    const FIELD_MAP: Record<string, string> = {
      sort_order: "sortOrder",
      created_at: "createdAt",
      updated_at: "updatedAt",
      target_date: "targetDate",
      completed_at: "completedAt",
      sequence_id: "sequenceId",
    };
    const rawField = orderBy.startsWith("-") ? orderBy.slice(1) : orderBy;
    const prismaField = FIELD_MAP[rawField] ?? rawField;
    const sortDir = orderBy.startsWith("-") ? "desc" : "asc";

    const [issues, totalCount] = await Promise.all([
      prisma.issue.findMany({
        where,
        skip,
        take: perPage + 1,
        include: ISSUE_INCLUDE,
        orderBy: {[prismaField]: sortDir},
      }),
      prisma.issue.count({where}),
    ]);

    const hasNext = issues.length > perPage;
    const pageIssues = hasNext ? issues.slice(0, perPage) : issues;

    return {
      grouped_by: "",
      next_cursor: `${perPage}:${page + 1}:0`,
      prev_cursor: `${perPage}:${Math.max(0, page - 1)}:1`,
      next_page_results: hasNext,
      prev_page_results: page > 0,
      total_count: totalCount,
      count: pageIssues.length,
      total_pages: Math.ceil(totalCount / perPage),
      extra_stats: null,
      total_results: totalCount,
      results: pageIssues.map((i: any) => ({
        id: i.id,
        name: i.name,
        state_id: i.stateId,
        priority: i.priority,
        project_id: i.projectId,
        workspace_id: i.workspaceId,
        sequence_id: i.sequenceId,
        sort_order: i.sortOrder ?? 0,
        created_at: i.createdAt?.toISOString(),
        updated_at: i.updatedAt?.toISOString(),
        target_date: i.targetDate ? (i.targetDate instanceof Date ? i.targetDate.toISOString().split("T")[0] : i.targetDate) : null,
        completed_at: i.completedAt ? (i.completedAt instanceof Date ? i.completedAt.toISOString() : i.completedAt) : null,
        assignee_ids: i.assignees?.map((a: any) => a.assigneeId) ?? [],
        label_ids: i.labels?.map((l: any) => l.labelId) ?? [],
        state__color: i.state?.color ?? "",
        state__group: i.state?.group ?? "backlog",
        state__name: i.state?.name ?? "",
      })),
    };
  })

  // ── Workspace-level issue view (global all-issues, my-issues, etc.) ──────────
  // The frontend calls /issues/ or /issues-detail/ depending on expand params.
  // Scope is limited to projects where the current user is an active member.

  .get("/:slug/issues/", async ({params: {slug}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);

    // Limit to projects where user is an active member
    const userProjectIds = (
      await prisma.projectMember.findMany({
        where: {workspaceId: ws.id, memberId: user.id, isActive: true, deletedAt: null},
        select: {projectId: true},
      })
    ).map((m) => m.projectId);

    const where: any = {
      workspaceId: ws.id,
      deletedAt: null,
      isDraft: false,
      projectId: {in: userProjectIds},
    };

    if (query.entity_id) where.entityId = query.entity_id;
    if (query.type === "my_issues") where.assignees = {some: {assigneeId: user.id, deletedAt: null}};

    // Parse the frontend `filters` JSON param (+ loose params) and apply it.
    const filters = normalizeFilters(query as Record<string, unknown>);
    await applyIssueFilters(where, filters, {workspaceId: ws.id});
    // Project filter must stay within the user's accessible projects.
    if (query.project_id) where.projectId = query.project_id;
    else if (filters.project?.length) where.projectId = {in: filters.project.filter((p) => userProjectIds.includes(p))};
    // "me" alias for assignees
    if (filters.assignees?.includes("me")) where.assignees = {some: {assigneeId: user.id, deletedAt: null}};

    const orderBy: any = {};
    const order = (query.order_by as string) ?? "-updated_at";
    const dir = order.startsWith("-") ? "desc" : "asc";
    const field = order.replace(/^-/, "");
    const fieldMap: Record<string, string> = {
      updated_at: "updatedAt",
      created_at: "createdAt",
      priority: "priority",
      state__name: "stateId",
      sort_order: "sortOrder",
    };
    orderBy[fieldMap[field] ?? "updatedAt"] = dir;

    // ── Grouped response (kanban / grouped list / grouped layouts) ─────────────
    const groupBy = query.group_by as string | undefined;
    const perPage = Number(query.per_page ?? 100);

    // Calendar groups by target_date — keyed by YYYY-MM-DD. Done in JS since the
    // set of dates is open-ended.
    if (groupBy === "target_date") {
      const calIssues = await prisma.issue.findMany({
        where: {...where, targetDate: {not: null}},
        include: ISSUE_INCLUDE,
        orderBy,
        take: 2000,
      });
      const results: Record<string, any> = {};
      for (const i of calIssues as any[]) {
        const key = i.targetDate ? new Date(i.targetDate).toISOString().split("T")[0] : "none";
        if (!results[key]) {
          results[key] = {
            results: [],
            total_results: 0,
            next_cursor: `${perPage}:1:0`,
            prev_cursor: `${perPage}:0:1`,
            next_page_results: false,
            prev_page_results: false,
          };
        }
        results[key].results.push(serializeIssue(i));
        results[key].total_results++;
      }
      return {
        total_count: calIssues.length,
        results,
        next_cursor: null,
        prev_cursor: null,
        next_page_results: false,
        prev_page_results: false,
      };
    }

    const SUPPORTED_GROUP_BY = ["state_id", "priority", "state__group", "project_id"];
    if (groupBy && SUPPORTED_GROUP_BY.includes(groupBy)) {
      const accessibleProjectIds = (where.projectId?.in as string[]) ?? userProjectIds;
      let groupValues: (string | null)[] = [];
      if (groupBy === "state_id") {
        const states = await prisma.state.findMany({
          where: {projectId: {in: accessibleProjectIds}, deletedAt: null},
          select: {id: true},
          orderBy: {sequence: "asc"},
        });
        groupValues = states.map((s) => s.id);
      } else if (groupBy === "priority") {
        groupValues = ["urgent", "high", "medium", "low", "none"];
      } else if (groupBy === "state__group") {
        groupValues = ["backlog", "unstarted", "started", "completed", "cancelled", "triage"];
      } else if (groupBy === "project_id") {
        groupValues = accessibleProjectIds;
      } else {
        groupValues = [];
      }

      const total_count = await prisma.issue.count({where});
      const results: Record<string, any> = {};
      for (const gv of groupValues) {
        const groupWhere: any = {...where};
        if (groupBy === "state_id") groupWhere.stateId = gv;
        else if (groupBy === "priority") groupWhere.priority = gv;
        else if (groupBy === "project_id") groupWhere.projectId = gv;
        else if (groupBy === "state__group") {
          const stateIds = await prisma.state.findMany({
            where: {projectId: {in: accessibleProjectIds}, group: gv as string, deletedAt: null},
            select: {id: true},
          });
          groupWhere.stateId = {in: stateIds.map((s) => s.id)};
        }
        const [groupIssues, groupCount] = await Promise.all([
          prisma.issue.findMany({where: groupWhere, include: ISSUE_INCLUDE, orderBy, take: perPage}),
          prisma.issue.count({where: groupWhere}),
        ]);
        results[gv ?? "none"] = {
          results: groupIssues.map(serializeIssue),
          total_results: groupCount,
          next_cursor: `${perPage}:1:0`,
          prev_cursor: `${perPage}:0:1`,
          next_page_results: groupCount > perPage,
          prev_page_results: false,
        };
      }
      return {total_count, results, next_cursor: null, prev_cursor: null, next_page_results: false, prev_page_results: false};
    }

    return paginate({
      query: (skip, take) => prisma.issue.findMany({where, skip, take, include: ISSUE_INCLUDE, orderBy}),
      count: () => prisma.issue.count({where}),
      cursor: query.cursor as string | undefined,
      transform: (items) => items.map(serializeIssue),
    });
  })

  // Alias: frontend requests /issues-detail/ when it needs relation expansion
  .get("/:slug/issues-detail/", async ({params: {slug}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);

    const userProjectIds = (
      await prisma.projectMember.findMany({
        where: {workspaceId: ws.id, memberId: user.id, isActive: true, deletedAt: null},
        select: {projectId: true},
      })
    ).map((m) => m.projectId);

    const where: any = {
      workspaceId: ws.id,
      deletedAt: null,
      isDraft: false,
      projectId: {in: userProjectIds},
    };

    if (query.type === "my_issues") where.assignees = {some: {assigneeId: user.id, deletedAt: null}};

    const filters = normalizeFilters(query as Record<string, unknown>);
    await applyIssueFilters(where, filters, {workspaceId: ws.id});
    if (query.project_id) where.projectId = query.project_id;
    else if (filters.project?.length) where.projectId = {in: filters.project.filter((p) => userProjectIds.includes(p))};
    if (filters.assignees?.includes("me")) where.assignees = {some: {assigneeId: user.id, deletedAt: null}};

    const orderBy: any = {};
    const order = (query.order_by as string) ?? "-updated_at";
    const dir = order.startsWith("-") ? "desc" : "asc";
    const field = order.replace(/^-/, "");
    const fieldMap: Record<string, string> = {
      updated_at: "updatedAt",
      created_at: "createdAt",
      priority: "priority",
      state__name: "stateId",
      sort_order: "sortOrder",
    };
    orderBy[fieldMap[field] ?? "updatedAt"] = dir;

    return paginate({
      query: (skip, take) => prisma.issue.findMany({where, skip, take, include: ISSUE_INCLUDE, orderBy}),
      count: () => prisma.issue.count({where}),
      cursor: query.cursor as string | undefined,
      transform: (items) => items.map(serializeIssue),
    });
  })

  // ── Critical (urgent) issues — unresolved across all workspace projects ──────
  .get("/:slug/urgent-issues/", async ({params: {slug}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const issues = await prisma.issue.findMany({
      where: {
        workspaceId: ws.id,
        priority: "urgent",
        deletedAt: null,
        isDraft: false,
        state: {group: {notIn: ["completed", "cancelled"]}},
      },
      include: {
        state: {select: {name: true, group: true, color: true}},
        project: {select: {id: true, identifier: true, name: true}},
        assignees: {where: {deletedAt: null}, select: {assigneeId: true}},
      },
      orderBy: {updatedAt: "desc"},
      take: 50,
    });
    return issues.map((i: any) => ({
      id: i.id,
      name: i.name,
      priority: i.priority,
      sequence_id: i.sequenceId,
      legacy_ticket_number: i.legacyTicketNumber ?? null,
      state: i.state ? {name: i.state.name, group: i.state.group, color: i.state.color} : null,
      project: i.project ? {id: i.project.id, identifier: i.project.identifier, name: i.project.name} : null,
      assignee_ids: i.assignees.map((a: any) => a.assigneeId),
      updated_at: i.updatedAt?.toISOString(),
    }));
  })

  // ── Global intake: pending intakes across all projects ────────────────────
  .get("/:slug/global-intake-issues/", async ({params: {slug}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);

    const userProjectIds = (
      await prisma.projectMember.findMany({
        where: {workspaceId: ws.id, memberId: user.id, isActive: true, deletedAt: null},
        select: {projectId: true},
      })
    ).map((m) => m.projectId);

    const statusFilter: number[] | null = (query as any).status
      ? String((query as any).status)
          .split(",")
          .map(Number)
      : [-2]; // default to pending

    const perPage = Number((query as any).per_page ?? 50);
    const cursor = (query as any).cursor ?? `${perPage}:0:0`;
    const page = Number(cursor.split(":")[1] ?? 0);
    const skip = page * perPage;

    const where: any = {workspaceId: ws.id, projectId: {in: userProjectIds}, deletedAt: null};
    if (statusFilter) where.status = {in: statusFilter};

    const [intakeIssues, total] = await Promise.all([
      prisma.intakeIssue.findMany({
        where,
        skip,
        take: perPage + 1,
        include: {
          issue: {select: {id: true, name: true, priority: true, projectId: true, sequenceId: true, createdAt: true, updatedAt: true}},
        },
        orderBy: {createdAt: "desc"},
      }),
      prisma.intakeIssue.count({where}),
    ]);

    // Fetch project data separately
    const projectIds = [...new Set(intakeIssues.map((ii: any) => ii.projectId).filter(Boolean))];
    const projects = projectIds.length
      ? await prisma.project.findMany({where: {id: {in: projectIds as string[]}}, select: {id: true, identifier: true, name: true}})
      : [];
    const projectMap = Object.fromEntries(projects.map((p: any) => [p.id, p]));

    const hasNext = intakeIssues.length > perPage;
    return {
      total_count: total,
      total_results: total,
      next_cursor: `${perPage}:${page + 1}:0`,
      prev_cursor: `${perPage}:${Math.max(0, page - 1)}:1`,
      next_page_results: hasNext,
      prev_page_results: page > 0,
      results: intakeIssues.slice(0, perPage).map((ii: any) => {
        const proj = projectMap[ii.projectId];
        return {
          id: ii.id,
          status: ii.status ?? -2,
          source: ii.source ?? "IN_APP",
          created_at: ii.createdAt?.toISOString(),
          project: proj ? {id: proj.id, identifier: proj.identifier, name: proj.name} : null,
          issue: ii.issue
            ? {
                id: ii.issue.id,
                name: ii.issue.name,
                priority: ii.issue.priority,
                project_id: ii.issue.projectId,
                sequence_id: ii.issue.sequenceId,
                created_at: ii.issue.createdAt?.toISOString(),
                updated_at: ii.issue.updatedAt?.toISOString(),
              }
            : null,
        };
      }),
    };
  });
