import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { getWorkspaceOrFail, getProjectOrFail } from "@utils/workspace";
import { serializeModule, serializeIssue, ISSUE_INCLUDE, isoDate } from "@utils/serialize";

const MODULE_INCLUDE = {
  members: { where: { deletedAt: null }, select: { memberId: true } },
  links:   { where: { deletedAt: null } },
  _count:  { select: { moduleIssues: { where: { deletedAt: null } } } },
} as const;

async function withIssueCounts(mod: any): Promise<any> {
  const issueStateGroups = await prisma.moduleIssue.findMany({
    where: { moduleId: mod.id, deletedAt: null },
    include: { issue: { include: { state: { select: { group: true } } } } },
  });
  const counts = { completed: 0, backlog: 0, started: 0, unstarted: 0, cancelled: 0 };
  for (const mi of issueStateGroups) {
    const g = (mi.issue as any)?.state?.group ?? "backlog";
    if (g === "completed") counts.completed++;
    else if (g === "backlog") counts.backlog++;
    else if (g === "started") counts.started++;
    else if (g === "unstarted") counts.unstarted++;
    else if (g === "cancelled") counts.cancelled++;
  }
  return {
    ...mod,
    completedIssues: counts.completed,
    backlogIssues:   counts.backlog,
    startedIssues:   counts.started,
    unstartedIssues: counts.unstarted,
    cancelledIssues: counts.cancelled,
  };
}

export const moduleModule = new Elysia({ prefix: "/workspaces/:slug/projects/:project_id" })
  .use(authPlugin)

  // ── Modules list — returns IModule[] (plain array, frontend expects forEach) ──

  .get("/modules/", async ({ params: { slug, project_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where: any = { projectId: project_id, deletedAt: null };
    if (query.archived === "true") { delete where.deletedAt; where.archivedAt = { not: null }; }
    else where.archivedAt = null;

    const modules = await prisma.module.findMany({
      where, include: MODULE_INCLUDE, orderBy: { createdAt: "desc" },
    });
    const enriched = await Promise.all(modules.map(withIssueCounts));
    return enriched.map(serializeModule);
  })

  .post("/modules/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }
    const b = body as any;
    if (!b.name) { set.status = 400; return { detail: "Name is required." }; }
    const mod = await prisma.module.create({
      data: {
        projectId: project_id, workspaceId: ws.id,
        name: b.name, description: b.description ?? null,
        startDate: b.start_date ? new Date(b.start_date) : null,
        targetDate: b.target_date ? new Date(b.target_date) : null,
        status: b.status ?? "backlog",
        leadId: b.lead ?? null,
        externalSource: b.external_source ?? null,
        externalId: b.external_id ?? null,
        createdById: user.id,
      },
      include: MODULE_INCLUDE,
    });
    set.status = 201;
    return serializeModule(await withIssueCounts(mod));
  })

  .get("/modules/:module_id/", async ({ params: { slug, project_id, module_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const mod = await prisma.module.findFirstOrThrow({
      where: { id: module_id, projectId: project_id, deletedAt: null },
      include: MODULE_INCLUDE,
    });
    return serializeModule(await withIssueCounts(mod));
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
    const mod = await prisma.module.update({ where: { id: module_id }, data, include: MODULE_INCLUDE });
    return serializeModule(await withIssueCounts(mod));
  })

  // PUT alias (some frontend calls use PUT)
  .put("/modules/:module_id/", async ({ params: { slug, project_id, module_id }, body, user, set }) => {
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
    const mod = await prisma.module.update({ where: { id: module_id }, data, include: MODULE_INCLUDE });
    return serializeModule(await withIssueCounts(mod));
  })

  .delete("/modules/:module_id/", async ({ params: { slug, project_id, module_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }
    await prisma.module.update({ where: { id: module_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // ── Archive ───────────────────────────────────────────────────────────────────

  .post("/modules/:module_id/archive/", async ({ params: { slug, project_id, module_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }
    const mod = await prisma.module.update({ where: { id: module_id }, data: { archivedAt: new Date() }, include: MODULE_INCLUDE });
    return serializeModule(mod);
  })

  .delete("/modules/:module_id/archive/", async ({ params: { slug, project_id, module_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const mod = await prisma.module.update({ where: { id: module_id }, data: { archivedAt: null }, include: MODULE_INCLUDE });
    return serializeModule(mod);
  })

  // ── Module Issues ─────────────────────────────────────────────────────────────

  .get("/modules/:module_id/issues/", async ({ params: { slug, project_id, module_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const moduleIssues = await prisma.moduleIssue.findMany({
      where: { moduleId: module_id, deletedAt: null },
      include: { issue: { include: ISSUE_INCLUDE } },
      orderBy: { createdAt: "asc" },
    });
    return moduleIssues.map(mi => serializeIssue(mi.issue));
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
    const existingSet = new Set(existing.map((e: any) => e.issueId));
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

  // ── Module Members ────────────────────────────────────────────────────────────

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

  // ── Module Links ──────────────────────────────────────────────────────────────

  .get("/modules/:module_id/links/", async ({ params: { slug, project_id, module_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const links = await prisma.moduleLink.findMany({ where: { moduleId: module_id, deletedAt: null } });
    return links.map(l => ({ id: l.id, url: l.url, title: l.title, created_at: isoDate(l.createdAt) }));
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
    return { id: link.id, url: link.url, title: link.title, created_at: isoDate(link.createdAt) };
  })

  .delete("/modules/:module_id/links/:link_id/", async ({ params: { module_id, link_id }, set }) => {
    await prisma.moduleLink.update({ where: { id: link_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  });
