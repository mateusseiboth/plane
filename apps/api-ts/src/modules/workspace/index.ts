import prisma from "@db";
import {authPlugin} from "@middleware/auth";
import {paginate} from "@utils/pagination";
import {getWorkspaceOrFail, requireWorkspaceMember, requireWorkspaceWriter} from "@utils/workspace";
import {randomBytes} from "crypto";
import Elysia from "elysia";

export const workspaceModule = new Elysia({prefix: "/workspaces"})
  .use(authPlugin)

  // ── List user workspaces ───────────────────────────────────────────────────

  .get("/", async ({user, query}) => {
    const where = {memberId: user.id, isActive: true, deletedAt: null};
    return paginate({
      query: (skip, take) =>
        prisma.workspaceMember.findMany({
          where,
          skip,
          take,
          include: {workspace: true},
          orderBy: {createdAt: "desc"},
        }),
      count: () => prisma.workspaceMember.count({where}),
      cursor: query.cursor as string | undefined,
      transform: (items) => items.map((m) => m.workspace),
    });
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
    return ws;
  })

  // ── Get workspace ─────────────────────────────────────────────────────────

  .get("/:slug/", async ({params: {slug}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return ws;
  })

  // ── Update workspace ──────────────────────────────────────────────────────

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

    return prisma.workspace.update({where: {id: ws.id}, data});
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

  // ── Invitations ───────────────────────────────────────────────────────────

  .get("/:slug/invitations/", async ({params: {slug}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where = {workspaceId: ws.id, accepted: false};
    return paginate({
      query: (skip, take) => prisma.workspaceMemberInvite.findMany({where, skip, take, orderBy: {createdAt: "desc"}}),
      count: () => prisma.workspaceMemberInvite.count({where}),
      cursor: query.cursor as string | undefined,
    });
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

  .get("/:slug/members/", async ({params: {slug}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where = {workspaceId: ws.id, isActive: true, deletedAt: null};
    return paginate({
      query: (skip, take) =>
        prisma.workspaceMember.findMany({
          where,
          skip,
          take,
          include: {member: {select: {id: true, email: true, firstName: true, lastName: true, displayName: true, avatar: true}}},
          orderBy: {createdAt: "asc"},
        }),
      count: () => prisma.workspaceMember.count({where}),
      cursor: query.cursor as string | undefined,
    });
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
    if (!m) {
      set.status = 404;
      return {detail: "Not a member."};
    }
    return m;
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
