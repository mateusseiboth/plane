import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";
import { getWorkspaceOrFail, getProjectOrFail } from "@utils/workspace";

export const moduleModule = new Elysia({ prefix: "/workspaces/:slug/projects/:project_id" })
  .use(authPlugin)

  // ── Modules CRUD ──────────────────────────────────────────────────────────

  .get("/modules/", async ({ params: { slug, project_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where: any = { projectId: project_id, deletedAt: null };
    if (query.archived === "true") { delete where.deletedAt; where.archivedAt = { not: null }; }
    else where.archivedAt = null;
    return paginate({
      query: (skip, take) =>
        prisma.module.findMany({
          where, skip, take,
          include: {
            members: { where: { deletedAt: null }, select: { memberId: true } },
            _count: { select: { moduleIssues: { where: { deletedAt: null } } } },
          },
          orderBy: { createdAt: "desc" },
        }),
      count: () => prisma.module.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/modules/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }

    const b = body as any;
    if (!b.name) { set.status = 400; return { detail: "Name is required." }; }

    const mod = await prisma.module.create({
      data: {
        projectId: project_id,
        workspaceId: ws.id,
        name: b.name,
        description: b.description ?? null,
        startDate: b.start_date ? new Date(b.start_date) : null,
        targetDate: b.target_date ? new Date(b.target_date) : null,
        status: b.status ?? "backlog",
        leadId: b.lead ?? null,
        externalSource: b.external_source ?? null,
        externalId: b.external_id ?? null,
        createdById: user.id,
      },
    });
    set.status = 201;
    return mod;
  })

  .get("/modules/:module_id/", async ({ params: { slug, project_id, module_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    return prisma.module.findFirstOrThrow({
      where: { id: module_id, projectId: project_id, deletedAt: null },
      include: {
        members: { where: { deletedAt: null }, include: { member: { select: { id: true, displayName: true, email: true } } } },
        links: { where: { deletedAt: null } },
        _count: { select: { moduleIssues: { where: { deletedAt: null } } } },
      },
    });
  })

  .patch("/modules/:module_id/", async ({ params: { slug, project_id, module_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }

    const b = body as any;
    const data: any = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.description !== undefined) data.description = b.description;
    if (b.start_date !== undefined) data.startDate = b.start_date ? new Date(b.start_date) : null;
    if (b.target_date !== undefined) data.targetDate = b.target_date ? new Date(b.target_date) : null;
    if (b.status !== undefined) data.status = b.status;
    if (b.lead !== undefined) data.leadId = b.lead;

    return prisma.module.update({ where: { id: module_id }, data });
  })

  .delete("/modules/:module_id/", async ({ params: { slug, project_id, module_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }
    await prisma.module.update({ where: { id: module_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // ── Archive/Unarchive ──────────────────────────────────────────────────────

  .post("/modules/:module_id/archive/", async ({ params: { slug, project_id, module_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }
    const mod = await prisma.module.update({ where: { id: module_id }, data: { archivedAt: new Date() } });
    return mod;
  })

  .delete("/modules/:module_id/archive/", async ({ params: { slug, project_id, module_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    return prisma.module.update({ where: { id: module_id }, data: { archivedAt: null } });
  })

  // ── Module Issues ─────────────────────────────────────────────────────────

  .get("/modules/:module_id/issues/", async ({ params: { slug, project_id, module_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where = { moduleId: module_id, deletedAt: null };
    return paginate({
      query: (skip, take) =>
        prisma.moduleIssue.findMany({ where, skip, take, include: { issue: true }, orderBy: { createdAt: "asc" } }),
      count: () => prisma.moduleIssue.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/modules/:module_id/issues/", async ({ params: { slug, project_id, module_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }

    const issueIds: string[] = (body as any).issues ?? [];
    const existing = await prisma.moduleIssue.findMany({
      where: { moduleId: module_id, issueId: { in: issueIds }, deletedAt: null },
      select: { issueId: true },
    });
    const existingSet = new Set(existing.map(e => e.issueId));
    const toCreate = issueIds.filter(id => !existingSet.has(id));

    await prisma.moduleIssue.createMany({
      data: toCreate.map(issueId => ({ moduleId: module_id, issueId, workspaceId: ws.id, projectId: project_id })),
    });
    set.status = 201;
    return { message: `Added ${toCreate.length} issues.` };
  })

  .delete("/modules/:module_id/issues/:issue_id/", async ({ params: { slug, project_id, module_id, issue_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }
    await prisma.moduleIssue.updateMany({ where: { moduleId: module_id, issueId: issue_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // ── Module Members ────────────────────────────────────────────────────────

  .post("/modules/:module_id/members/", async ({ params: { slug, project_id, module_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }

    const memberIds: string[] = (body as any).member_ids ?? [];
    await prisma.moduleMember.createMany({
      data: memberIds.map(memberId => ({ moduleId: module_id, memberId, workspaceId: ws.id, projectId: project_id })),
      skipDuplicates: true,
    });
    set.status = 201;
    return { message: `Added ${memberIds.length} members.` };
  })

  .delete("/modules/:module_id/members/:member_id/", async ({ params: { slug, project_id, module_id, member_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }
    await prisma.moduleMember.updateMany({ where: { moduleId: module_id, memberId: member_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // ── Module Links ──────────────────────────────────────────────────────────

  .get("/modules/:module_id/links/", async ({ params: { slug, project_id, module_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where = { moduleId: module_id, deletedAt: null };
    return paginate({
      query: (skip, take) => prisma.moduleLink.findMany({ where, skip, take }),
      count: () => prisma.moduleLink.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/modules/:module_id/links/", async ({ params: { slug, project_id, module_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const b = body as any;
    if (!b.url) { set.status = 400; return { detail: "URL is required." }; }
    const link = await prisma.moduleLink.create({
      data: { moduleId: module_id, workspaceId: ws.id, projectId: project_id, url: b.url, title: b.title ?? "", createdById: user.id },
    });
    set.status = 201;
    return link;
  })

  .delete("/modules/:module_id/links/:link_id/", async ({ params: { module_id, link_id }, set }) => {
    await prisma.moduleLink.update({ where: { id: link_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  });
