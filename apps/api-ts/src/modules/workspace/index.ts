import prisma from "@db";
import {authPlugin} from "@middleware/auth";
import {paginate} from "@utils/pagination";
import {getWorkspaceOrFail, requireWorkspaceMember, requireWorkspaceWriter} from "@utils/workspace";
import {randomBytes} from "crypto";
import Elysia from "elysia";

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
      ? {id: owner.id, email: owner.email, first_name: owner.firstName, last_name: owner.lastName, display_name: owner.displayName, avatar: owner.avatar ?? "", avatar_url: owner.avatarUrl ?? null, is_bot: false}
      : null,
    total_members: totalMembers,
    total_projects: totalProjects,
    role: memberRole ?? null,
  };
}

export const workspaceModule = new Elysia({prefix: "/workspaces"})
  .use(authPlugin)

  // ── Slug availability (GET /workspaces/workspace-slug-check/ is the fallback;
  //    the canonical path /workspace-slug-check/ is added directly in index.ts) ──

  .get("/workspace-slug-check/", async ({query, set}) => {
    const slug = (query.slug as string | undefined)?.toLowerCase();
    if (!slug) { set.status = 400; return {error: "slug is required."}; }
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
    return Promise.all(memberships.map(m => workspaceDto(m.workspace, m.role)));
  })

  // ── Create workspace ───────────────────────────────────────────────────────

  .post("/", async ({body, user, set}) => {
    const b = body as any;
    if (!b.name) { set.status = 400; return {detail: "Name is required."}; }
    if (!b.slug) { set.status = 400; return {detail: "Slug is required."}; }

    const exists = await prisma.workspace.findFirst({where: {slug: b.slug, deletedAt: null}});
    if (exists) { set.status = 409; return {detail: "Workspace with this slug already exists."}; }

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
    if (m.role < 20) { set.status = 403; return {detail: "Only admins can update workspace settings."}; }
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
    return invites.map(i => ({
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
    });
  })

  .post("/:slug/stickies/", async ({params: {slug}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    const sticky = await prisma.sticky.create({
      data: {workspaceId: ws.id, ownerId: user.id, title: b.title ?? "", description: b.description ?? null, color: b.color ?? "#ffffff"},
    });
    set.status = 201;
    return sticky;
  })

  .patch("/:slug/stickies/:sticky_id/", async ({params: {slug, sticky_id}, body, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    const data: any = {};
    if (b.title !== undefined) data.title = b.title;
    if (b.description !== undefined) data.description = b.description;
    if (b.color !== undefined) data.color = b.color;
    if (b.sort_order !== undefined) data.sortOrder = b.sort_order;
    return prisma.sticky.update({where: {id: sticky_id}, data});
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
    const where = {workspaceId: ws.id, userId: user.id};
    return paginate({
      query: (skip, take) => prisma.userRecentVisit.findMany({where, skip, take, orderBy: {visitedAt: "desc"}}),
      count: () => prisma.userRecentVisit.count({where}),
      cursor: query.cursor as string | undefined,
    });
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

  // ── Global search ──────────────────────────────────────────────────────────

  .get("/:slug/search/", async ({params: {slug}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const q = (query.query as string) ?? "";
    if (!q.trim()) return {results: []};

    const [issues, projects, pages, cycles, modules] = await Promise.all([
      prisma.issue.findMany({
        where: {workspaceId: ws.id, deletedAt: null, OR: [{name: {contains: q, mode: "insensitive"}}, {legacyTicketNumber: {contains: q}}]},
        select: {id: true, name: true, sequenceId: true, priority: true, project: {select: {id: true, identifier: true}}},
        take: 10,
      }),
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

    return {
      results: {
        issues: issues.map((i) => ({...i, type: "issue"})),
        projects: projects.map((p) => ({...p, type: "project"})),
        pages: pages.map((p) => ({...p, type: "page"})),
        cycles: cycles.map((c) => ({...c, type: "cycle"})),
        modules: modules.map((m) => ({...m, type: "module"})),
      },
    };
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
      include: {member: {select: {id: true, email: true, firstName: true, lastName: true, displayName: true, avatar: true, avatarUrl: true}}},
      orderBy: {createdAt: "asc"},
    });
    return members.map(m => ({
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
    if (b.role !== undefined) data.role = b.role;
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

  .post("/:slug/members/leave/", async ({params: {slug}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await prisma.workspaceMember.updateMany({
      where: {workspaceId: ws.id, memberId: user.id},
      data: {isActive: false, deletedAt: new Date()},
    });
    set.status = 204;
    return null;
  })

  .get("/:slug/workspace-members/me/", async ({params: {slug}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    const m = await prisma.workspaceMember.findFirst({
      where: {workspaceId: ws.id, memberId: user.id, deletedAt: null},
    });
    if (!m) { set.status = 404; return {detail: "Not a member."}; }
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

    const maxSeq = await prisma.issue.aggregate({where: {projectId: draft.projectId}, _max: {sequenceId: true}});
    const sequenceId = (maxSeq._max.sequenceId ?? 0) + 1;

    const issue = await prisma.$transaction(async (tx) => {
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

  // ── Home preferences ──────────────────────────────────────────────────────────

  .get("/:slug/home-preferences/", async ({params: {slug}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return {widgets: []};
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
    return {key, value: (body as any).value ?? null};
  })

  // ── Sidebar preferences ───────────────────────────────────────────────────────

  .get("/:slug/sidebar-preferences/", async ({params: {slug}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return {};
  })

  .patch("/:slug/sidebar-preferences/", async ({params: {slug}, body, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return {detail: "Preferences updated."};
  })

  // ── User-favorites (alias for /favorites/ — Django uses this path) ───────────

  .get("/:slug/user-favorites/", async ({params: {slug}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where = {workspaceId: ws.id, userId: user.id, deletedAt: null};
    const favs = await prisma.userFavorite.findMany({where, orderBy: {sequence: "asc"}});
    return favs.map(f => ({
      id: f.id, workspace: ws.id, entity_type: f.entityType, entity_identifier: f.entityId,
      name: f.name, parent: f.parentId, sequence: f.sequence,
      created_at: f.createdAt.toISOString(), updated_at: f.updatedAt.toISOString(),
    }));
  })

  .post("/:slug/user-favorites/", async ({params: {slug}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    const fav = await prisma.userFavorite.create({
      data: {workspaceId: ws.id, userId: user.id, entityType: b.entity_type, entityId: b.entity_id ?? b.entity_identifier, name: b.name ?? "", parentId: b.parent ?? null},
    });
    set.status = 201;
    return {id: fav.id, workspace: ws.id, entity_type: fav.entityType, entity_identifier: fav.entityId, name: fav.name, parent: fav.parentId, sequence: fav.sequence};
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
    const projectIds = projects.map(p => p.id);

    const projectData = await Promise.all(projectIds.map(async pid => {
      const [assigned, completed, created, pending] = await Promise.all([
        prisma.issueAssignee.count({where: {workspaceId: ws.id, projectId: pid, assigneeId: user_id, deletedAt: null}}),
        prisma.issue.count({where: {workspaceId: ws.id, projectId: pid, deletedAt: null, isDraft: false, state: {group: "completed"}, assignees: {some: {assigneeId: user_id, deletedAt: null}}}}),
        prisma.issue.count({where: {workspaceId: ws.id, projectId: pid, deletedAt: null, isDraft: false, createdById: user_id}}),
        prisma.issue.count({where: {workspaceId: ws.id, projectId: pid, deletedAt: null, isDraft: false, state: {group: {in: ["backlog", "unstarted", "started"]}}, assignees: {some: {assigneeId: user_id, deletedAt: null}}}}),
      ]);
      return {id: pid, assigned_issues: assigned, completed_issues: completed, created_issues: created, pending_issues: pending};
    }));

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
      prisma.issue.groupBy({by: ["stateId"], where, _count: {id: true}}).then(async rows => {
        const stateIds = rows.map(r => r.stateId).filter(Boolean) as string[];
        const states = await prisma.state.findMany({where: {id: {in: stateIds}}, select: {id: true, group: true}});
        const groupMap: Record<string, number> = {};
        for (const r of rows) {
          const g = states.find(s => s.id === r.stateId)?.group ?? "backlog";
          groupMap[g] = (groupMap[g] ?? 0) + r._count.id;
        }
        return Object.entries(groupMap).map(([state_group, state_count]) => ({state_group, state_count}));
      }),
      prisma.issue.groupBy({by: ["priority"], where, _count: {id: true}}).then(rows => rows.map(r => ({priority: r.priority, priority_count: r._count.id}))),
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
    const cursor   = (query.cursor as string)   ?? "100:0:0";
    const perPage  = Number(query.per_page ?? 100);
    const layout   = (query.layout as string)   ?? "list";

    const parts = cursor.split(":").map(Number);
    const page   = parts[1] ?? 0;
    const skip   = page * perPage;

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
      sort_order: "sortOrder", created_at: "createdAt", updated_at: "updatedAt",
      target_date: "targetDate", completed_at: "completedAt", sequence_id: "sequenceId",
    };
    const rawField = orderBy.startsWith("-") ? orderBy.slice(1) : orderBy;
    const prismaField = FIELD_MAP[rawField] ?? rawField;
    const sortDir = orderBy.startsWith("-") ? "desc" : "asc";

    const [issues, totalCount] = await Promise.all([
      prisma.issue.findMany({
        where, skip, take: perPage + 1,
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

  // ── Workspace-level issue view ─────────────────────────────────────────────

  .get("/:slug/issues/", async ({params: {slug}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);

    const where: any = {workspaceId: ws.id, deletedAt: null, isDraft: false};
    if (query.project_id) where.projectId = query.project_id;
    if (query.priority) where.priority = query.priority;
    if (query.state_group) {
      const states = await prisma.state.findMany({
        where: {workspaceId: ws.id, group: query.state_group as string, deletedAt: null},
        select: {id: true},
      });
      where.stateId = {in: states.map((s) => s.id)};
    }
    if (query.entity_id) where.entityId = query.entity_id;
    if (query.legacy_ticket_number) where.legacyTicketNumber = {contains: query.legacy_ticket_number as string};
    if (query.assignee_id) where.assignees = {some: {assigneeId: query.assignee_id, deletedAt: null}};

    return paginate({
      query: (skip, take) =>
        prisma.issue.findMany({
          where,
          skip,
          take,
          include: {
            state: {select: {id: true, name: true, color: true, group: true}},
            entity: {select: {id: true, name: true}},
            project: {select: {id: true, name: true, identifier: true}},
            assignees: {where: {deletedAt: null}, select: {assigneeId: true}},
          },
          orderBy: {updatedAt: "desc"},
        }),
      count: () => prisma.issue.count({where}),
      cursor: query.cursor as string | undefined,
      transform: (items) =>
        items.map((i: any) => ({
          ...i,
          assignees: i.assignees?.map((a: any) => a.assigneeId) ?? [],
        })),
    });
  });
