import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";
import { getWorkspaceOrFail, requireWorkspaceMember, requireWorkspaceWriter } from "@utils/workspace";
import { randomBytes } from "crypto";

export const workspaceModule = new Elysia({ prefix: "/workspaces" })
  .use(authPlugin)

  // ── List user workspaces ───────────────────────────────────────────────────

  .get("/", async ({ user, query }) => {
    const where = { memberId: user.id, isActive: true, deletedAt: null };
    return paginate({
      query: (skip, take) =>
        prisma.workspaceMember.findMany({
          where, skip, take,
          include: { workspace: true },
          orderBy: { createdAt: "desc" },
        }),
      count: () => prisma.workspaceMember.count({ where }),
      cursor: query.cursor as string | undefined,
      transform: (items) => items.map(m => m.workspace),
    });
  })

  // ── Create workspace ───────────────────────────────────────────────────────

  .post("/", async ({ body, user, set }) => {
    const b = body as any;
    if (!b.name) { set.status = 400; return { detail: "Name is required." }; }
    if (!b.slug) { set.status = 400; return { detail: "Slug is required." }; }

    const exists = await prisma.workspace.findFirst({ where: { slug: b.slug, deletedAt: null } });
    if (exists) { set.status = 409; return { detail: "Workspace with this slug already exists." }; }

    const ws = await prisma.$transaction(async (tx) => {
      const w = await tx.workspace.create({
        data: { name: b.name, slug: b.slug, orgSize: b.org_size ?? null, timezone: b.timezone ?? "UTC" },
      });
      await tx.workspaceMember.create({
        data: { workspaceId: w.id, memberId: user.id, role: 20, isActive: true },
      });
      return w;
    });
    set.status = 201;
    return ws;
  })

  // ── Get workspace ─────────────────────────────────────────────────────────

  .get("/:slug/", async ({ params: { slug }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return ws;
  })

  // ── Update workspace ──────────────────────────────────────────────────────

  .patch("/:slug/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const m = await requireWorkspaceWriter(ws.id, user.id);
    if (m.role < 20) { set.status = 403; return { detail: "Only admins can update workspace settings." }; }

    const b = body as any;
    const data: any = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.org_size !== undefined) data.orgSize = b.org_size;
    if (b.timezone !== undefined) data.timezone = b.timezone;
    if (b.logo !== undefined) data.logo = b.logo;

    return prisma.workspace.update({ where: { id: ws.id }, data });
  })

  // ── Delete workspace ──────────────────────────────────────────────────────

  .delete("/:slug/", async ({ params: { slug }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const m = await requireWorkspaceWriter(ws.id, user.id);
    if (m.role < 20) { set.status = 403; return { detail: "Only admins can delete workspaces." }; }
    await prisma.workspace.update({ where: { id: ws.id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // ── Invitations ───────────────────────────────────────────────────────────

  .get("/:slug/invitations/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where = { workspaceId: ws.id, accepted: false };
    return paginate({
      query: (skip, take) => prisma.workspaceMemberInvite.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      count: () => prisma.workspaceMemberInvite.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/:slug/invitations/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const m = await requireWorkspaceWriter(ws.id, user.id);
    if (m.role < 15) { set.status = 403; return { detail: "Only members can invite others." }; }

    const emails: Array<{ email: string; role: number }> = (body as any).emails ?? [];
    const invites = await prisma.workspaceMemberInvite.createMany({
      data: emails.map(e => ({
        workspaceId: ws.id,
        email: e.email,
        role: e.role ?? 5,
        token: randomBytes(32).toString("hex"),
      })),
    });
    set.status = 201;
    return { invited: invites.count };
  })

  .delete("/:slug/invitations/:invite_id/", async ({ params: { slug, invite_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    await prisma.workspaceMemberInvite.delete({ where: { id: invite_id } }).catch(() => {});
    set.status = 204;
    return null;
  })

  // ── Stickies ──────────────────────────────────────────────────────────────

  .get("/:slug/stickies/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where = { workspaceId: ws.id, ownerId: user.id, deletedAt: null };
    return paginate({
      query: (skip, take) => prisma.sticky.findMany({ where, skip, take, orderBy: { sortOrder: "asc" } }),
      count: () => prisma.sticky.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/:slug/stickies/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    const sticky = await prisma.sticky.create({
      data: { workspaceId: ws.id, ownerId: user.id, title: b.title ?? "", description: b.description ?? null, color: b.color ?? "#ffffff" },
    });
    set.status = 201;
    return sticky;
  })

  .patch("/:slug/stickies/:sticky_id/", async ({ params: { slug, sticky_id }, body, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    const data: any = {};
    if (b.title !== undefined) data.title = b.title;
    if (b.description !== undefined) data.description = b.description;
    if (b.color !== undefined) data.color = b.color;
    if (b.sort_order !== undefined) data.sortOrder = b.sort_order;
    return prisma.sticky.update({ where: { id: sticky_id }, data });
  })

  .delete("/:slug/stickies/:sticky_id/", async ({ params: { slug, sticky_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    await prisma.sticky.update({ where: { id: sticky_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // ── User Favorites ────────────────────────────────────────────────────────

  .get("/:slug/favorites/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where = { workspaceId: ws.id, userId: user.id, deletedAt: null };
    return paginate({
      query: (skip, take) => prisma.userFavorite.findMany({ where, skip, take, orderBy: { sequence: "asc" } }),
      count: () => prisma.userFavorite.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/:slug/favorites/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    const fav = await prisma.userFavorite.create({
      data: {
        workspaceId: ws.id, userId: user.id,
        entityType: b.entity_type, entityId: b.entity_id,
        name: b.name ?? "", parentId: b.parent ?? null,
      },
    });
    set.status = 201;
    return fav;
  })

  .delete("/:slug/favorites/:favorite_id/", async ({ params: { slug, favorite_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    await prisma.userFavorite.update({ where: { id: favorite_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // ── Recent Visits ─────────────────────────────────────────────────────────

  .get("/:slug/recent-visits/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where = { workspaceId: ws.id, userId: user.id };
    return paginate({
      query: (skip, take) => prisma.userRecentVisit.findMany({ where, skip, take, orderBy: { visitedAt: "desc" } }),
      count: () => prisma.userRecentVisit.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/:slug/recent-visits/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    const visit = await prisma.userRecentVisit.upsert({
      where: { id: "00000000-0000-0000-0000-000000000000" }, // fake - will never match
      update: { visitedAt: new Date() },
      create: {
        workspaceId: ws.id, userId: user.id,
        entityType: b.entity_type, entityId: b.entity_id,
      },
    }).catch(async () =>
      prisma.userRecentVisit.create({
        data: { workspaceId: ws.id, userId: user.id, entityType: b.entity_type, entityId: b.entity_id },
      })
    );
    set.status = 201;
    return visit;
  })

  // ── Global search ──────────────────────────────────────────────────────────

  .get("/:slug/search/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const q = (query.query as string) ?? "";
    if (!q.trim()) return { results: [] };

    const [issues, projects, pages, cycles, modules] = await Promise.all([
      prisma.issue.findMany({
        where: { workspaceId: ws.id, deletedAt: null, OR: [{ name: { contains: q, mode: "insensitive" } }, { legacyTicketNumber: { contains: q } }] },
        select: { id: true, name: true, sequenceId: true, priority: true, project: { select: { id: true, identifier: true } } },
        take: 10,
      }),
      prisma.project.findMany({
        where: { workspaceId: ws.id, deletedAt: null, name: { contains: q, mode: "insensitive" } },
        select: { id: true, name: true, identifier: true },
        take: 5,
      }),
      prisma.page.findMany({
        where: { workspaceId: ws.id, deletedAt: null, name: { contains: q, mode: "insensitive" } },
        select: { id: true, name: true },
        take: 5,
      }),
      prisma.cycle.findMany({
        where: { workspaceId: ws.id, deletedAt: null, name: { contains: q, mode: "insensitive" } },
        select: { id: true, name: true, projectId: true },
        take: 5,
      }),
      prisma.module.findMany({
        where: { workspaceId: ws.id, deletedAt: null, name: { contains: q, mode: "insensitive" } },
        select: { id: true, name: true, projectId: true },
        take: 5,
      }),
    ]);

    return {
      results: {
        issues: issues.map(i => ({ ...i, type: "issue" })),
        projects: projects.map(p => ({ ...p, type: "project" })),
        pages: pages.map(p => ({ ...p, type: "page" })),
        cycles: cycles.map(c => ({ ...c, type: "cycle" })),
        modules: modules.map(m => ({ ...m, type: "module" })),
      },
    };
  })

  // ── Workspace-level issue view ─────────────────────────────────────────────

  .get("/:slug/issues/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);

    const where: any = { workspaceId: ws.id, deletedAt: null, isDraft: false };
    if (query.project_id) where.projectId = query.project_id;
    if (query.priority) where.priority = query.priority;
    if (query.state_group) {
      const states = await prisma.state.findMany({ where: { workspaceId: ws.id, group: query.state_group as string, deletedAt: null }, select: { id: true } });
      where.stateId = { in: states.map(s => s.id) };
    }
    if (query.entity_id) where.entityId = query.entity_id;
    if (query.legacy_ticket_number) where.legacyTicketNumber = { contains: query.legacy_ticket_number as string };
    if (query.assignee_id) where.assignees = { some: { assigneeId: query.assignee_id, deletedAt: null } };

    return paginate({
      query: (skip, take) =>
        prisma.issue.findMany({
          where, skip, take,
          include: {
            state: { select: { id: true, name: true, color: true, group: true } },
            entity: { select: { id: true, name: true } },
            project: { select: { id: true, name: true, identifier: true } },
            assignees: { where: { deletedAt: null }, select: { assigneeId: true } },
          },
          orderBy: { updatedAt: "desc" },
        }),
      count: () => prisma.issue.count({ where }),
      cursor: query.cursor as string | undefined,
      transform: (items) => items.map((i: any) => ({
        ...i,
        assignees: i.assignees?.map((a: any) => a.assigneeId) ?? [],
      })),
    });
  });
