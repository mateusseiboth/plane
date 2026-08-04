import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";
import { getWorkspaceOrFail, getProjectOrFail } from "@utils/workspace";
import { EProjectAction, requireProjectAction } from "@utils/permission-checks";

export const cycleModule = new Elysia({ prefix: "/workspaces/:slug/projects/:project_id" })
  .use(authPlugin)

  .get("/cycles/", async ({ params: { slug, project_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where = { projectId: project_id, deletedAt: null };
    return paginate({
      query: (skip, take) => prisma.cycle.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      count: () => prisma.cycle.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/cycles/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.CYCLE_MANAGE);

    const b = body as any;
    if (!b.name) { set.status = 400; return { detail: "O nome é obrigatório." }; }

    const cycle = await prisma.cycle.create({
      data: {
        projectId: project_id,
        workspaceId: ws.id,
        ownedById: user.id,
        name: b.name,
        description: b.description ?? null,
        startDate: b.start_date ? new Date(b.start_date) : null,
        endDate: b.end_date ? new Date(b.end_date) : null,
        externalSource: b.external_source ?? null,
        externalId: b.external_id ?? null,
        createdById: user.id,
      },
    });

    set.status = 201;
    return cycle;
  })

  .get("/cycles/:cycle_id/", async ({ params: { slug, project_id, cycle_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    return prisma.cycle.findFirstOrThrow({ where: { id: cycle_id, projectId: project_id, deletedAt: null } });
  })

  .patch("/cycles/:cycle_id/", async ({ params: { slug, project_id, cycle_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.CYCLE_MANAGE);

    const b = body as any;
    const data: any = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.description !== undefined) data.description = b.description;
    if (b.start_date !== undefined) data.startDate = b.start_date ? new Date(b.start_date) : null;
    if (b.end_date !== undefined) data.endDate = b.end_date ? new Date(b.end_date) : null;
    if (b.status !== undefined) data.status = b.status;

    return prisma.cycle.update({ where: { id: cycle_id }, data });
  })

  .delete("/cycles/:cycle_id/", async ({ params: { slug, project_id, cycle_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.CYCLE_MANAGE);
    await prisma.cycle.update({ where: { id: cycle_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  .get("/cycles/:cycle_id/issues/", async ({ params: { slug, project_id, cycle_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where = { cycleId: cycle_id, deletedAt: null };
    return paginate({
      query: (skip, take) =>
        prisma.cycleIssue.findMany({ where, skip, take, include: { issue: true }, orderBy: { createdAt: "asc" } }),
      count: () => prisma.cycleIssue.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/cycles/:cycle_id/issues/", async ({ params: { slug, project_id, cycle_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.CYCLE_MANAGE);

    const issueIds: string[] = (body as any).issues ?? [];
    const existing = await prisma.cycleIssue.findMany({
      where: { cycleId: cycle_id, issueId: { in: issueIds }, deletedAt: null },
      select: { issueId: true },
    });
    const existingSet = new Set(existing.map((e) => e.issueId));
    const toCreate = issueIds.filter((id) => !existingSet.has(id));

    await prisma.cycleIssue.createMany({
      data: toCreate.map((issueId) => ({ cycleId: cycle_id, issueId, workspaceId: ws.id, projectId: project_id })),
    });

    set.status = 201;
    return { message: `${toCreate.length} chamados adicionados.` };
  })

  .delete("/cycles/:cycle_id/issues/:issue_id/", async ({ params: { slug, project_id, cycle_id, issue_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.CYCLE_MANAGE);
    await prisma.cycleIssue.updateMany({ where: { cycleId: cycle_id, issueId: issue_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  });
