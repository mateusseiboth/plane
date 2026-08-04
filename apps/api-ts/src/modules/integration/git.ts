import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";
import { getWorkspaceOrFail, requireWorkspaceWriter } from "@utils/workspace";

export const gitIntegrationModule = new Elysia({ prefix: "/workspaces/:slug/git" })
  .use(authPlugin)

  // ── Git Integration Config ────────────────────────────────────────────────

  .get("/configs/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    return prisma.gitIntegrationConfig.findMany({
      where: { workspaceId: ws.id, deletedAt: null },
      select: { id: true, provider: true, appId: true, installationId: true, isActive: true, createdAt: true, repositories: { where: { deletedAt: null }, select: { id: true, name: true, fullName: true, projectId: true, syncEnabled: true } } },
    });
  })

  .post("/configs/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const b = body as any;
    if (!b.provider) { set.status = 400; return { detail: "O provedor é obrigatório (github | gitlab | bitbucket)." }; }

    try {
      const config = await prisma.gitIntegrationConfig.create({
        data: {
          workspaceId: ws.id, provider: b.provider,
          appId: b.app_id ?? null, clientId: b.client_id ?? null,
          clientSecret: b.client_secret ?? null, webhookSecret: b.webhook_secret ?? null,
          installationId: b.installation_id ?? null,
          metadata: b.metadata ?? {},
          isActive: b.is_active ?? true, createdById: user.id,
        },
      });
      set.status = 201;
      return config;
    } catch (e: any) {
      if (e?.code === "P2002") { set.status = 409; return { detail: `A integração com ${b.provider} já existe.` }; }
      throw e;
    }
  })

  .patch("/configs/:config_id/", async ({ params: { slug, config_id }, body, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const b = body as any;
    const data: any = {};
    if (b.is_active !== undefined) data.isActive = b.is_active;
    if (b.installation_id !== undefined) data.installationId = b.installation_id;
    if (b.metadata !== undefined) data.metadata = b.metadata;
    return prisma.gitIntegrationConfig.update({ where: { id: config_id }, data });
  })

  .delete("/configs/:config_id/", async ({ params: { slug, config_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    await prisma.gitIntegrationConfig.update({ where: { id: config_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // ── Repositories ──────────────────────────────────────────────────────────

  .get("/configs/:config_id/repositories/", async ({ params: { slug, config_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const where = { configId: config_id, deletedAt: null };
    return paginate({
      query: (skip, take) => prisma.gitRepository.findMany({ where, skip, take }),
      count: () => prisma.gitRepository.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/configs/:config_id/repositories/", async ({ params: { slug, config_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const b = body as any;
    if (!b.repo_id || !b.name || !b.full_name || !b.url) { set.status = 400; return { detail: "repo_id, name, full_name e url são obrigatórios." }; }

    const repo = await prisma.gitRepository.create({
      data: {
        configId: config_id, workspaceId: ws.id,
        projectId: b.project_id ?? null, repoId: b.repo_id,
        name: b.name, fullName: b.full_name, url: b.url,
        syncEnabled: b.sync_enabled ?? false, metadata: b.metadata ?? {},
      },
    });
    set.status = 201;
    return repo;
  })

  .patch("/repositories/:repo_id/", async ({ params: { slug, repo_id }, body, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const b = body as any;
    const data: any = {};
    if (b.project_id !== undefined) data.projectId = b.project_id;
    if (b.sync_enabled !== undefined) data.syncEnabled = b.sync_enabled;
    return prisma.gitRepository.update({ where: { id: repo_id }, data });
  })

  .delete("/repositories/:repo_id/", async ({ params: { slug, repo_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    await prisma.gitRepository.update({ where: { id: repo_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // ── Issue ↔ Git link ──────────────────────────────────────────────────────

  .get("/repositories/:repo_id/issue-links/", async ({ params: { slug, repo_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const where = { repositoryId: repo_id, deletedAt: null };
    return paginate({
      query: (skip, take) => prisma.gitIssueLink.findMany({ where, skip, take, include: { issue: { select: { id: true, name: true, sequenceId: true } } } }),
      count: () => prisma.gitIssueLink.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/repositories/:repo_id/issue-links/", async ({ params: { slug, repo_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const b = body as any;
    const link = await prisma.gitIssueLink.create({
      data: {
        repositoryId: repo_id, issueId: b.issue_id, workspaceId: ws.id,
        gitIssueId: b.git_issue_id, gitIssueUrl: b.git_issue_url,
        gitIssueNum: b.git_issue_num ?? null, gitIssueTitle: b.git_issue_title ?? null,
        gitState: b.git_state ?? "open", syncStatus: b.sync_status ?? "synced",
        metadata: b.metadata ?? {},
      },
    });
    set.status = 201;
    return link;
  });
