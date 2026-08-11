/**
 * Premium feature endpoints:
 * - Time tracking
 * - Estimates
 * - Intake/Inbox
 * - Import/Export
 * - Audit logs
 * - Issue types & custom properties
 * - Deploy boards
 * - Issue reactions/votes/subscribers
 */
import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";
import { nextSequenceId } from "@utils/sequence";
import { EProjectAction, requireProjectAction } from "@utils/permission-checks";
import { getWorkspaceOrFail, requireWorkspaceMember, requireWorkspaceWriter, getProjectOrFail } from "@utils/workspace";
import { serializeIssue } from "@utils/serialize";


/**
 * Views no formato que o frontend consome (`IProjectView`, snake_case, com
 * `project`/`workspace` em vez de `projectId`/`workspaceId`). Devolver o objeto
 * do Prisma cru faz a tela de views perder projeto, filtros e travamento.
 */
function serializeView(v: any, isFavorite = false) {
  return {
    id: v.id,
    name: v.name,
    description: v.description ?? "",
    access: v.access,
    filters: v.filters ?? {},
    rich_filters: v.filters ?? {},
    query: v.filters ?? {},
    query_data: v.queryData ?? {},
    display_filters: (v.queryData as any)?.display_filters ?? {},
    display_properties: (v.queryData as any)?.display_properties ?? {},
    logo_props: (v.queryData as any)?.logo_props,
    is_global: v.isGlobal,
    is_locked: (v.queryData as any)?.is_locked ?? false,
    is_favorite: isFavorite,
    project: v.projectId ?? null,
    project_id: v.projectId ?? null,
    workspace: v.workspaceId,
    workspace_id: v.workspaceId,
    owned_by: v.createdById ?? null,
    created_by: v.createdById ?? null,
    updated_by: v.createdById ?? null,
    created_at: v.createdAt,
    updated_at: v.updatedAt,
  };
}

/** Bloco `*_detail` de usuário que o frontend espera (`IUserLite`). */
function userLite(u: any) {
  return {
    id: u?.id ?? null,
    display_name: u?.displayName ?? "",
    first_name: u?.firstName ?? "",
    last_name: u?.lastName ?? "",
    email: u?.email ?? "",
    avatar: u?.avatar ?? "",
    avatar_url: u?.avatarUrl ?? null,
  };
}

/**
 * O Django guarda a lista de projetos exportados no próprio registro
 * (ExporterHistory.project, um array). Aqui ela vive em `filters.project`;
 * jobs antigos só têm `projectId`, então os dois casos viram array.
 */
function exportedProjectIds(job: any): string[] {
  const fromFilters = (job.filters as any)?.project;
  if (Array.isArray(fromFilters)) return fromFilters.map(String);
  return job.projectId ? [job.projectId] : [];
}

/**
 * Histórico de exportação no formato da tela "Exportações anteriores"
 * (`IExportData`). `initiated_by_detail` nunca vem nulo: a tela desestrutura o
 * objeto direto e quebraria com null.
 */
function serializeExportJob(job: any, initiators: Map<string, any>) {
  return {
    id: job.id,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
    project: exportedProjectIds(job),
    provider: job.format,
    status: job.status,
    url: job.downloadUrl ?? "",
    token: job.token ?? "",
    created_by: job.createdById ?? null,
    updated_by: job.createdById ?? null,
    initiated_by: job.createdById ?? null,
    initiated_by_detail: userLite(job.createdById ? initiators.get(job.createdById) : null),
  };
}

const USER_LITE_SELECT = {
  id: true, displayName: true, firstName: true, lastName: true, email: true, avatar: true, avatarUrl: true,
} as const;

/** Formatos aceitos na exportação — mesma lista do Django. */
const EXPORT_PROVIDERS = ["csv", "xlsx", "json"];

/** Ids das views que o usuário marcou como favoritas (tabela `user_favorites`). */
async function favoriteViewIds(workspaceId: string, userId: string, viewIds: string[]): Promise<Set<string>> {
  if (!viewIds.length) return new Set();
  const favorites = await prisma.userFavorite.findMany({
    where: {workspaceId, userId, entityType: "view", entityId: {in: viewIds}, deletedAt: null},
    select: {entityId: true},
  });
  return new Set(favorites.map((f) => f.entityId));
}

export const premiumModule = new Elysia()
  .use(authPlugin)

  // ─────────────────────────────────────────────────────────────────────────
  // TIME TRACKING
  // ─────────────────────────────────────────────────────────────────────────

  .get("/workspaces/:slug/projects/:project_id/issues/:issue_id/time-logs/", async ({ params: { slug, project_id, issue_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where = { issueId: issue_id, deletedAt: null };
    return paginate({
      query: (skip, take) => prisma.issueTimeLog.findMany({ where, skip, take, include: { member: { select: { id: true, displayName: true } } }, orderBy: { loggedDate: "desc" } }),
      count: () => prisma.issueTimeLog.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/workspaces/:slug/projects/:project_id/issues/:issue_id/time-logs/", async ({ params: { slug, project_id, issue_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const b = body as any;
    if (!b.duration_minutes || !b.logged_date) { set.status = 400; return { detail: "duration_minutes e logged_date são obrigatórios." }; }

    const log = await prisma.issueTimeLog.create({
      data: {
        issueId: issue_id, workspaceId: ws.id, projectId: project_id,
        memberId: b.member_id ?? user.id,
        loggedDate: new Date(b.logged_date),
        durationMinutes: b.duration_minutes,
        description: b.description ?? null,
        createdById: user.id,
      },
    });
    set.status = 201;
    return log;
  })

  .patch("/workspaces/:slug/projects/:project_id/issues/:issue_id/time-logs/:log_id/", async ({ params: { slug, project_id, issue_id, log_id }, body, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const b = body as any;
    const data: any = {};
    if (b.duration_minutes !== undefined) data.durationMinutes = b.duration_minutes;
    if (b.logged_date !== undefined) data.loggedDate = new Date(b.logged_date);
    if (b.description !== undefined) data.description = b.description;
    if (b.is_approved !== undefined) data.isApproved = b.is_approved;
    return prisma.issueTimeLog.update({ where: { id: log_id }, data });
  })

  .delete("/workspaces/:slug/projects/:project_id/issues/:issue_id/time-logs/:log_id/", async ({ params: { slug, project_id, log_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    await prisma.issueTimeLog.update({ where: { id: log_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // ─────────────────────────────────────────────────────────────────────────
  // INTAKE / INBOX
  // ─────────────────────────────────────────────────────────────────────────

  .get("/workspaces/:slug/projects/:project_id/intakes/", async ({ params: { slug, project_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    return prisma.intake.findMany({ where: { projectId: project_id, deletedAt: null } });
  })

  .post("/workspaces/:slug/projects/:project_id/intakes/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permissão negada." }; }
    const b = body as any;
    const intake = await prisma.intake.create({
      data: { projectId: project_id, workspaceId: ws.id, name: b.name ?? "Intake", description: b.description ?? "", createdById: user.id },
    });
    set.status = 201;
    return intake;
  })

  .get("/workspaces/:slug/projects/:project_id/intakes/:intake_id/issues/", async ({ params: { slug, project_id, intake_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where: any = { intakeId: intake_id, deletedAt: null };
    if (query.status !== undefined) where.status = Number(query.status);
    return paginate({
      query: (skip, take) =>
        prisma.intakeIssue.findMany({
          where, skip, take,
          include: { issue: { select: { id: true, name: true, priority: true, state: { select: { id: true, name: true, group: true } } } } },
          orderBy: { createdAt: "desc" },
        }),
      count: () => prisma.intakeIssue.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/workspaces/:slug/projects/:project_id/intakes/:intake_id/issues/", async ({ params: { slug, project_id, intake_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const b = body as any;

    // Create issue + intake issue atomically
    const defaultState = await prisma.state.findFirst({ where: { projectId: project_id, isTriage: true, deletedAt: null } });

    const intakeIssue = await prisma.$transaction(async (tx) => {
      const sequenceId = await nextSequenceId(tx, project_id);
      const issue = await tx.issue.create({
        data: {
          projectId: project_id, workspaceId: ws.id, sequenceId, name: b.name ?? "Untitled",
          descriptionHtml: b.description_html ?? "<p></p>",
          descriptionStripped: (b.description_html ?? "").replace(/<[^>]+>/g, ""),
          stateId: defaultState?.id ?? null, priority: b.priority ?? "none",
          isDraft: false, createdById: user.id,
        },
      });
      return tx.intakeIssue.create({
        data: {
          intakeId: intake_id, issueId: issue.id, workspaceId: ws.id, projectId: project_id,
          status: -2, source: b.source ?? "in-app", createdById: user.id,
        },
        include: { issue: true },
      });
    });
    set.status = 201;
    return intakeIssue;
  })

  .patch("/workspaces/:slug/projects/:project_id/intakes/:intake_id/issues/:issue_id/", async ({ params: { slug, project_id, intake_id, issue_id }, body, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const b = body as any;
    const data: any = {};
    if (b.status !== undefined) data.status = b.status;
    if (b.snooze_till !== undefined) data.snoozeTill = b.snooze_till ? new Date(b.snooze_till) : null;
    if (b.duplicate_of !== undefined) data.duplicateOf = b.duplicate_of;

    return prisma.intakeIssue.update({ where: { id: issue_id }, data, include: { issue: true } });
  })

  // ─────────────────────────────────────────────────────────────────────────
  // IMPORT / EXPORT
  // ─────────────────────────────────────────────────────────────────────────

  .get("/workspaces/:slug/import-jobs/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const where = { workspaceId: ws.id, deletedAt: null };
    return paginate({
      query: (skip, take) => prisma.importJob.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      count: () => prisma.importJob.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/workspaces/:slug/import-jobs/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const b = body as any;
    if (!b.source) { set.status = 400; return { detail: "source é obrigatório (jira|linear|asana|clickup|github|notion|confluence|csv)." }; }
    const job = await prisma.importJob.create({
      data: {
        workspaceId: ws.id, projectId: b.project_id ?? null, source: b.source,
        config: b.config ?? {}, metadata: b.metadata ?? {}, token: b.token ?? null,
        status: "queued", createdById: user.id,
      },
    });
    set.status = 201;
    return job;
  })

  .get("/workspaces/:slug/import-jobs/:job_id/", async ({ params: { slug, job_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    return prisma.importJob.findFirstOrThrow({ where: { id: job_id, workspaceId: ws.id } });
  })

  .post("/workspaces/:slug/export-issues/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    // A tela de exportação manda {provider, project: string[], multiple};
    // chamadas internas mais antigas mandam {format, project_id}.
    const provider = b.provider ?? b.format ?? "csv";
    if (!EXPORT_PROVIDERS.includes(provider)) {
      set.status = 400;
      return { detail: `Formato '${provider}' não suportado. Use csv, xlsx ou json.` };
    }
    const projectIds: string[] = Array.isArray(b.project) ? b.project : b.project_id ? [b.project_id] : [];
    const job = await prisma.exportJob.create({
      data: {
        workspaceId: ws.id, projectId: projectIds[0] ?? null,
        format: provider,
        // `project` fica nos filtros porque a exportação é de vários projetos e
        // a coluna projectId só guarda um.
        filters: { ...(b.filters ?? {}), project: projectIds, multiple: b.multiple ?? false, rich_filters: b.rich_filters ?? {} },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: "queued", createdById: user.id,
      },
    });
    set.status = 201;
    return job;
  })

  /**
   * Histórico de exportações (Django: ExportIssuesEndpoint.get). A tela
   * "Exportações anteriores" pagina por cursor e mostra quem exportou, quantos
   * projetos, o formato, o status e o link de download.
   */
  .get("/workspaces/:slug/export-issues/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where = { workspaceId: ws.id };
    const page = await paginate({
      query: (skip, take) => prisma.exportJob.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      count: () => prisma.exportJob.count({ where }),
      cursor: query.cursor as string | undefined,
      perPage: Number(query.per_page) || undefined,
      transform: async (jobs) => {
        const ids = [...new Set(jobs.map((j: any) => j.createdById).filter(Boolean))] as string[];
        const users = ids.length
          ? await prisma.user.findMany({ where: { id: { in: ids } }, select: USER_LITE_SELECT })
          : [];
        const byId = new Map(users.map((u) => [u.id, u]));
        return jobs.map((j) => serializeExportJob(j, byId));
      },
    });
    // O paginador do Django devolve também count/total_pages/extra_stats, e o
    // tipo IExportServiceResponse do frontend os declara.
    const limitPorPagina = Number(page.next_cursor.split(":")[0]) || 100;
    return {
      ...page,
      count: page.results.length,
      total_pages: Math.ceil(page.total_count / limitPorPagina),
      extra_stats: null,
    };
  })

  .get("/workspaces/:slug/export-jobs/:job_id/", async ({ params: { slug, job_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return prisma.exportJob.findFirstOrThrow({ where: { id: job_id, workspaceId: ws.id } });
  })

  // ─────────────────────────────────────────────────────────────────────────
  // AUDIT LOGS
  // ─────────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────
  // ISSUE TYPES & CUSTOM PROPERTIES
  // ─────────────────────────────────────────────────────────────────────────

  .get("/workspaces/:slug/issue-types/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return prisma.issueType.findMany({
      where: { workspaceId: ws.id, deletedAt: null, isActive: true },
      include: { properties: { where: { deletedAt: null, isActive: true }, include: { options: { where: { isActive: true } } } } },
      orderBy: { level: "asc" },
    });
  })

  .post("/workspaces/:slug/issue-types/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const b = body as any;
    if (!b.name) { set.status = 400; return { detail: "O nome é obrigatório." }; }
    const type = await prisma.issueType.create({
      data: { workspaceId: ws.id, projectId: b.project_id ?? null, name: b.name, description: b.description ?? "", isEpic: b.is_epic ?? false, level: b.level ?? 0, isDefault: b.is_default ?? false },
    });
    set.status = 201;
    return type;
  })

  .get("/workspaces/:slug/issue-properties/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where: any = { workspaceId: ws.id, deletedAt: null };
    if (query.issue_type_id) where.issueTypeId = query.issue_type_id;
    return prisma.issueProperty.findMany({ where, include: { options: { where: { isActive: true } } }, orderBy: { sortOrder: "asc" } });
  })

  .post("/workspaces/:slug/issue-properties/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const b = body as any;
    if (!b.name || !b.property_type) { set.status = 400; return { detail: "name e property_type são obrigatórios." }; }
    const prop = await prisma.issueProperty.create({
      data: { workspaceId: ws.id, issueTypeId: b.issue_type_id ?? null, name: b.name, displayName: b.display_name ?? b.name, propertyType: b.property_type, isRequired: b.is_required ?? false, isMulti: b.is_multi ?? false, defaultValue: b.default_value ?? null, extraSettings: b.extra_settings ?? null, sortOrder: b.sort_order ?? 65535 },
    });
    set.status = 201;
    return prop;
  })

  // ─────────────────────────────────────────────────────────────────────────
  // ISSUE REACTIONS, VOTES, SUBSCRIBERS
  // ─────────────────────────────────────────────────────────────────────────

  .get("/workspaces/:slug/projects/:project_id/issues/:issue_id/reactions/", async ({ params: { slug, project_id, issue_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    return prisma.issueReaction.findMany({ where: { issueId: issue_id, deletedAt: null }, include: { actor: { select: { id: true, displayName: true } } } });
  })

  .post("/workspaces/:slug/projects/:project_id/issues/:issue_id/reactions/", async ({ params: { slug, project_id, issue_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const b = body as any;
    try {
      const r = await prisma.issueReaction.create({
        data: { issueId: issue_id, actorId: user.id, workspaceId: ws.id, projectId: project_id, reaction: b.reaction },
      });
      set.status = 201;
      return r;
    } catch (e: any) {
      if (e?.code === "P2002") { set.status = 409; return { detail: "Você já reagiu." }; }
      throw e;
    }
  })

  .delete("/workspaces/:slug/projects/:project_id/issues/:issue_id/reactions/:reaction/", async ({ params: { slug, project_id, issue_id, reaction }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    await prisma.issueReaction.updateMany({ where: { issueId: issue_id, actorId: user.id, reaction }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  .post("/workspaces/:slug/projects/:project_id/issues/:issue_id/votes/", async ({ params: { slug, project_id, issue_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    try {
      const v = await prisma.issueVote.create({
        data: { issueId: issue_id, actorId: user.id, workspaceId: ws.id, projectId: project_id, vote: (body as any).vote ?? 1 },
      });
      set.status = 201;
      return v;
    } catch (e: any) {
      if (e?.code === "P2002") { set.status = 409; return { detail: "Você já votou." }; }
      throw e;
    }
  })

  .delete("/workspaces/:slug/projects/:project_id/issues/:issue_id/votes/", async ({ params: { slug, project_id, issue_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    await prisma.issueVote.updateMany({ where: { issueId: issue_id, actorId: user.id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  .get("/workspaces/:slug/projects/:project_id/issues/:issue_id/subscribers/", async ({ params: { slug, project_id, issue_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    return prisma.issueSubscriber.findMany({ where: { issueId: issue_id, deletedAt: null }, include: { subscriber: { select: { id: true, displayName: true } } } });
  })

  .post("/workspaces/:slug/projects/:project_id/issues/:issue_id/subscribe/", async ({ params: { slug, project_id, issue_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    try {
      const sub = await prisma.issueSubscriber.create({
        data: { issueId: issue_id, subscriberId: user.id, workspaceId: ws.id, projectId: project_id },
      });
      set.status = 201;
      return sub;
    } catch (e: any) {
      if (e?.code === "P2002") { set.status = 409; return { detail: "Você já está inscrito." }; }
      throw e;
    }
  })

  /**
   * Situação da inscrição do usuário atual.
   *
   * O frontend consulta este GET para desenhar o sino do chamado como "seguindo"
   * ou "não seguindo". Ele não existia: a chamada dava 404 e o botão mostrava
   * sempre o mesmo estado, independentemente da inscrição.
   */
  .get("/workspaces/:slug/projects/:project_id/issues/:issue_id/subscribe/", async ({ params: { slug, project_id, issue_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const inscricao = await prisma.issueSubscriber.findFirst({
      where: { issueId: issue_id, subscriberId: user.id, deletedAt: null },
    });
    return { subscribed: !!inscricao };
  })

  /** Cancelar a inscrição pelo mesmo caminho de criá-la, como o frontend faz. */
  .delete("/workspaces/:slug/projects/:project_id/issues/:issue_id/subscribe/", async ({ params: { slug, project_id, issue_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    await prisma.issueSubscriber.updateMany({ where: { issueId: issue_id, subscriberId: user.id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  .delete("/workspaces/:slug/projects/:project_id/issues/:issue_id/unsubscribe/", async ({ params: { slug, project_id, issue_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    await prisma.issueSubscriber.updateMany({ where: { issueId: issue_id, subscriberId: user.id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // ─────────────────────────────────────────────────────────────────────────
  // BULK OPERATIONS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Ajuste de datas em massa — é o que a linha do tempo usa ao arrastar várias
   * barras de uma vez. Não tinha sido migrado: cada arrasto múltiplo dava 404 e
   * as datas não gravavam.
   */
  .post("/workspaces/:slug/projects/:project_id/issue-dates/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const updates = ((body as any)?.updates ?? []) as Array<{id: string; start_date?: string | null; target_date?: string | null}>;
    if (!Array.isArray(updates) || updates.length === 0) {
      set.status = 400;
      return { detail: "Informe ao menos uma alteração em `updates`." };
    }
    for (const u of updates) {
      if (!u?.id) continue;
      await prisma.issue.updateMany({
        where: { id: u.id, projectId: project_id, workspaceId: ws.id, deletedAt: null },
        data: {
          ...(u.start_date !== undefined && { startDate: u.start_date ? new Date(u.start_date) : null }),
          ...(u.target_date !== undefined && { targetDate: u.target_date ? new Date(u.target_date) : null }),
        },
      });
    }
    return { updated: updates.length };
  })

  /**
   * Lixeira do projeto: chamados com exclusão lógica, para consulta e
   * recuperação. A listagem normal filtra `deletedAt: null`, então sem esta
   * rota não havia como enxergá-los.
   */
  .get("/workspaces/:slug/projects/:project_id/deleted-issues/", async ({ params: { slug, project_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const excluidos = await prisma.issue.findMany({
      where: { projectId: project_id, workspaceId: ws.id, deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      take: 200,
    });
    return { results: excluidos.map(serializeIssue), total_count: excluidos.length };
  })

  .post("/workspaces/:slug/projects/:project_id/issues/bulk-update/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    // Bulk edit touches items the caller did not author, so it needs ISSUE_EDIT_ALL.
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.ISSUE_EDIT_ALL);

    const b = body as any;
    const issueIds: string[] = b.issue_ids ?? [];
    if (!issueIds.length) { set.status = 400; return { detail: "issue_ids é obrigatório." }; }

    const data: any = { updatedById: user.id };
    if (b.state !== undefined) data.stateId = b.state;
    if (b.priority !== undefined) data.priority = b.priority;
    if (b.target_date !== undefined) data.targetDate = b.target_date ? new Date(b.target_date) : null;

    const result = await prisma.issue.updateMany({
      where: { id: { in: issueIds }, projectId: project_id },
      data,
    });

    if (b.assignees !== undefined) {
      await prisma.issueAssignee.updateMany({ where: { issueId: { in: issueIds } }, data: { deletedAt: new Date() } });
      if (b.assignees.length) {
        await prisma.issueAssignee.createMany({
          data: issueIds.flatMap(id => b.assignees.map((uid: string) => ({ issueId: id, assigneeId: uid, workspaceId: ws.id, projectId: project_id }))),
          skipDuplicates: true,
        });
      }
    }

    if (b.labels !== undefined) {
      await prisma.issueLabel.updateMany({ where: { issueId: { in: issueIds } }, data: { deletedAt: new Date() } });
      if (b.labels.length) {
        await prisma.issueLabel.createMany({
          data: issueIds.flatMap(id => b.labels.map((lid: string) => ({ issueId: id, labelId: lid, workspaceId: ws.id, projectId: project_id }))),
          skipDuplicates: true,
        });
      }
    }

    return { updated: result.count };
  })

  .post("/workspaces/:slug/projects/:project_id/issues/bulk-delete/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.ISSUE_DELETE_ALL);

    const issueIds: string[] = (body as any).issue_ids ?? [];
    const result = await prisma.issue.updateMany({
      where: { id: { in: issueIds }, projectId: project_id },
      data: { deletedAt: new Date() },
    });
    return { deleted: result.count };
  })

  .post("/workspaces/:slug/projects/:project_id/issues/bulk-archive/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.ISSUE_DELETE_ALL);

    const issueIds: string[] = (body as any).issue_ids ?? [];
    const result = await prisma.issue.updateMany({
      where: { id: { in: issueIds }, projectId: project_id },
      data: { archivedAt: new Date() },
    });
    return { archived: result.count };
  })

  // ─────────────────────────────────────────────────────────────────────────
  // ISSUE VIEWS
  // ─────────────────────────────────────────────────────────────────────────

  .get("/workspaces/:slug/views/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where = { workspaceId: ws.id, isGlobal: true, deletedAt: null };
    return paginate({
      query: (skip, take) => prisma.issueView.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      count: () => prisma.issueView.count({ where }),
      cursor: query.cursor as string | undefined,
      transform: async (items) => {
        const favoritas = await favoriteViewIds(ws.id, user.id, items.map((v: any) => v.id));
        return items.map((v: any) => serializeView(v, favoritas.has(v.id)));
      },
    });
  })

  .post("/workspaces/:slug/views/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    if (!b.name) { set.status = 400; return { detail: "O nome é obrigatório." }; }
    const view = await prisma.issueView.create({
      data: { workspaceId: ws.id, name: b.name, description: b.description ?? "", filters: b.filters ?? {}, queryData: b.query_data ?? {}, isGlobal: true, access: b.access ?? "PUBLIC", createdById: user.id },
    });
    set.status = 201;
    return serializeView(view);
  })

  .get("/workspaces/:slug/projects/:project_id/views/", async ({ params: { slug, project_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where = { workspaceId: ws.id, projectId: project_id, deletedAt: null };
    return paginate({
      query: (skip, take) => prisma.issueView.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      count: () => prisma.issueView.count({ where }),
      cursor: query.cursor as string | undefined,
      transform: async (items) => {
        const favoritas = await favoriteViewIds(ws.id, user.id, items.map((v: any) => v.id));
        return items.map((v: any) => serializeView(v, favoritas.has(v.id)));
      },
    });
  })

  .post("/workspaces/:slug/projects/:project_id/views/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const b = body as any;
    if (!b.name) { set.status = 400; return { detail: "O nome é obrigatório." }; }
    const view = await prisma.issueView.create({
      data: { workspaceId: ws.id, projectId: project_id, name: b.name, description: b.description ?? "", filters: b.filters ?? {}, queryData: b.query_data ?? {}, isGlobal: false, access: b.access ?? "PUBLIC", createdById: user.id },
    });
    set.status = 201;
    return serializeView(view);
  })

  /**
   * Detalhe, edição e remoção de uma visualização — inclusive no caminho com
   * projeto, que é o que o frontend usa.
   *
   * Só existiam as versões de espaço de trabalho: abrir, renomear ou excluir
   * uma visualização salva DENTRO de um sistema devolvia 404.
   */
  .get("/workspaces/:slug/views/:view_id/", async ({ params: { slug, view_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const view = await prisma.issueView.findFirst({ where: { id: view_id, workspaceId: ws.id, deletedAt: null } });
    if (!view) { set.status = 404; return { detail: "Visualização não encontrada." }; }
    const favoritas = await favoriteViewIds(ws.id, user.id, [view.id]);
    return serializeView(view, favoritas.has(view.id));
  })

  .get("/workspaces/:slug/projects/:project_id/views/:view_id/", async ({ params: { slug, project_id, view_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const view = await prisma.issueView.findFirst({ where: { id: view_id, projectId: project_id, deletedAt: null } });
    if (!view) { set.status = 404; return { detail: "Visualização não encontrada." }; }
    const favoritas = await favoriteViewIds(ws.id, user.id, [view.id]);
    return serializeView(view, favoritas.has(view.id));
  })

  .patch("/workspaces/:slug/projects/:project_id/views/:view_id/", async ({ params: { slug, project_id, view_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const b = body as any;
    const data: any = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.description !== undefined) data.description = b.description;
    if (b.filters !== undefined) data.filters = b.filters;
    if (b.query_data !== undefined) data.queryData = b.query_data;
    if (b.access !== undefined) data.access = b.access;
    const {count} = await prisma.issueView.updateMany({ where: { id: view_id, projectId: project_id }, data });
    if (!count) { set.status = 404; return { detail: "Visualização não encontrada." }; }
    return serializeView(await prisma.issueView.findUnique({ where: { id: view_id } }));
  })

  .delete("/workspaces/:slug/projects/:project_id/views/:view_id/", async ({ params: { slug, project_id, view_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    await prisma.issueView.updateMany({ where: { id: view_id, projectId: project_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  .patch("/workspaces/:slug/views/:view_id/", async ({ params: { slug, view_id }, body, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = body as any;
    const data: any = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.description !== undefined) data.description = b.description;
    if (b.filters !== undefined) data.filters = b.filters;
    if (b.query_data !== undefined) data.queryData = b.query_data;
    if (b.access !== undefined) data.access = b.access;
    return serializeView(await prisma.issueView.update({ where: { id: view_id }, data }));
  })

  .delete("/workspaces/:slug/views/:view_id/", async ({ params: { slug, view_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    await prisma.issueView.update({ where: { id: view_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // ─────────────────────────────────────────────────────────────────────────
  // VIEWS FAVORITAS DO USUÁRIO
  // Django: IssueViewFavoriteViewSet. Grava na mesma tabela dos demais
  // favoritos (user_favorites, entity_type = "view"), então a barra lateral e
  // estas rotas enxergam sempre o mesmo registro.
  // Diferente do Django, basta ser membro do projeto: favoritar é preferência
  // pessoal, como já acontece em /workspaces/:slug/user-favorites/.
  // ─────────────────────────────────────────────────────────────────────────

  .get("/workspaces/:slug/projects/:project_id/user-favorite-views/", async ({ params: { slug, project_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const views = await prisma.issueView.findMany({
      where: { projectId: project_id, deletedAt: null },
      select: { id: true, name: true },
    });
    const nomePorView = new Map(views.map((v) => [v.id, v.name]));
    const favorites = await prisma.userFavorite.findMany({
      where: {
        workspaceId: ws.id, userId: user.id, entityType: "view",
        entityId: { in: views.map((v) => v.id) }, deletedAt: null,
      },
      orderBy: { sequence: "asc" },
    });
    return favorites.map((f) => ({
      id: f.id,
      workspace: ws.id,
      project_id,
      entity_type: f.entityType,
      entity_identifier: f.entityId,
      view: f.entityId,
      name: f.name || nomePorView.get(f.entityId) || "",
      sequence: f.sequence,
      created_at: f.createdAt.toISOString(),
      updated_at: f.updatedAt.toISOString(),
    }));
  })

  .post("/workspaces/:slug/projects/:project_id/user-favorite-views/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const viewId = (body as any)?.view;
    if (!viewId) { set.status = 400; return { detail: "O campo `view` é obrigatório." }; }

    const view = await prisma.issueView.findFirst({ where: { id: viewId, projectId: project_id, deletedAt: null } });
    if (!view) { set.status = 404; return { detail: "Visualização não encontrada." }; }

    // Favoritar duas vezes não pode duplicar a linha: a barra lateral mostraria
    // a mesma view repetida e o desfavoritar deixaria sobra.
    const jaFavorita = await prisma.userFavorite.findFirst({
      where: { workspaceId: ws.id, userId: user.id, entityType: "view", entityId: viewId, deletedAt: null },
    });
    if (!jaFavorita) {
      await prisma.userFavorite.create({
        data: { workspaceId: ws.id, userId: user.id, entityType: "view", entityId: viewId, name: view.name },
      });
    }
    set.status = 204;
    return null;
  })

  .delete("/workspaces/:slug/projects/:project_id/user-favorite-views/:view_id/", async ({ params: { slug, project_id, view_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const { count } = await prisma.userFavorite.deleteMany({
      where: { workspaceId: ws.id, userId: user.id, entityType: "view", entityId: view_id },
    });
    if (!count) { set.status = 404; return { detail: "Favorito não encontrado." }; }
    set.status = 204;
    return null;
  })

  // ─────────────────────────────────────────────────────────────────────────
  // DEPLOY BOARDS
  // ─────────────────────────────────────────────────────────────────────────

  .get("/workspaces/:slug/projects/:project_id/deploy-boards/", async ({ params: { slug, project_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    return prisma.deployBoard.findMany({ where: { projectId: project_id, deletedAt: null } });
  })

  .post("/workspaces/:slug/projects/:project_id/deploy-boards/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permissão negada." }; }
    const b = body as any;
    const board = await prisma.deployBoard.create({
      data: {
        projectId: project_id, workspaceId: ws.id,
        anchor: b.anchor ?? Math.random().toString(36).substring(2, 15),
        commentsAccess: b.comments_access ?? false,
        reactionsAccess: b.reactions_access ?? false,
        votesAccess: b.votes_access ?? false,
        isPublic: b.is_public ?? false,
        viewProps: b.view_props ?? {},
      },
    });
    set.status = 201;
    return board;
  });
