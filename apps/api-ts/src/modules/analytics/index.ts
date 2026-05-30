import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";
import { getWorkspaceOrFail, requireWorkspaceMember, requireWorkspaceWriter } from "@utils/workspace";

export const analyticsModule = new Elysia({ prefix: "/workspaces/:slug" })
  .use(authPlugin)

  // ── Default analytics (issue distribution) ───────────────────────────────

  .get("/default-analytics/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);

    const baseWhere: any = { workspaceId: ws.id, deletedAt: null };
    if (query.project_id) baseWhere.projectId = query.project_id;

    const [
      total, completed, inProgress, pending,
      urgent, high, medium, low, noPriority,
      avgCompletionDays,
    ] = await Promise.all([
      prisma.issue.count({ where: { ...baseWhere, isDraft: false } }),
      prisma.issue.count({ where: { ...baseWhere, isDraft: false, state: { group: "completed" } } }),
      prisma.issue.count({ where: { ...baseWhere, isDraft: false, state: { group: "started" } } }),
      prisma.issue.count({ where: { ...baseWhere, isDraft: false, state: { group: { in: ["backlog", "unstarted"] } } } }),
      prisma.issue.count({ where: { ...baseWhere, priority: "urgent" } }),
      prisma.issue.count({ where: { ...baseWhere, priority: "high" } }),
      prisma.issue.count({ where: { ...baseWhere, priority: "medium" } }),
      prisma.issue.count({ where: { ...baseWhere, priority: "low" } }),
      prisma.issue.count({ where: { ...baseWhere, priority: "none" } }),
      prisma.$queryRaw<[{ avg: number | null }]>`
        SELECT AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 86400) as avg
        FROM issues
        WHERE workspace_id = ${ws.id}::uuid
          AND deleted_at IS NULL
          AND completed_at IS NOT NULL
      `.then(r => r[0]?.avg ? Math.round(Number(r[0].avg) * 100) / 100 : null),
    ]);

    const byState = await prisma.issue.groupBy({
      by: ["stateId"],
      where: { ...baseWhere, isDraft: false },
      _count: { id: true },
    });

    return {
      total_issues: total,
      completed_issues: completed,
      pending_issues: pending,
      in_progress_issues: inProgress,
      priorities: { urgent, high, medium, low, none: noPriority },
      avg_completion_days: avgCompletionDays,
      by_state: byState.map(r => ({ state_id: r.stateId, count: r._count.id })),
    };
  })

  // ── Analytics views (saved) ───────────────────────────────────────────────

  .get("/analytic-view/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where = { workspaceId: ws.id, deletedAt: null };
    return paginate({
      query: (skip, take) => prisma.analyticView.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      count: () => prisma.analyticView.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/analytic-view/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    if (!b.name) { set.status = 400; return { detail: "Name is required." }; }
    const view = await prisma.analyticView.create({
      data: {
        workspaceId: ws.id, name: b.name, description: b.description ?? "",
        query: b.query ?? {}, queryData: b.query_data ?? {},
        createdById: user.id,
      },
    });
    set.status = 201;
    return view;
  })

  .get("/analytic-view/:view_id/", async ({ params: { slug, view_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return prisma.analyticView.findFirstOrThrow({ where: { id: view_id, workspaceId: ws.id, deletedAt: null } });
  })

  .patch("/analytic-view/:view_id/", async ({ params: { slug, view_id }, body, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    const data: any = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.description !== undefined) data.description = b.description;
    if (b.query !== undefined) data.query = b.query;
    if (b.query_data !== undefined) data.queryData = b.query_data;
    return prisma.analyticView.update({ where: { id: view_id }, data });
  })

  .delete("/analytic-view/:view_id/", async ({ params: { slug, view_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    await prisma.analyticView.update({ where: { id: view_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // ── Project stats ──────────────────────────────────────────────────────────

  .get("/project-stats/", async ({ params: { slug }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);

    const projects = await prisma.project.findMany({
      where: { workspaceId: ws.id, deletedAt: null, archivedAt: null, members: { some: { memberId: user.id, isActive: true, deletedAt: null } } },
      select: { id: true, name: true, identifier: true },
    });

    const stats = await Promise.all(projects.map(async p => {
      const [total, completed, open] = await Promise.all([
        prisma.issue.count({ where: { projectId: p.id, deletedAt: null, isDraft: false } }),
        prisma.issue.count({ where: { projectId: p.id, deletedAt: null, isDraft: false, state: { group: "completed" } } }),
        prisma.issue.count({ where: { projectId: p.id, deletedAt: null, isDraft: false, state: { group: { notIn: ["completed", "cancelled"] } } } }),
      ]);
      return { project: p, total, completed, open };
    }));

    return { results: stats };
  });
