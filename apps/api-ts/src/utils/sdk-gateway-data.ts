/**
 * Consultas de dados compartilhadas pelos gateways de plugin e de widget. Só
 * acesso a dados + serialização do contrato dos SDKs; permissão da extensão e
 * autenticação ficam em cada gateway.
 *
 * Toda consulta recebe o `ISdkGatewayScope` (workspace + projetos do membro) e o
 * aplica, inclusive nas buscas por id: um registro fora do escopo é 404, como se
 * não existisse.
 */
import prisma from "@db";
import {
  buildEntityScopeWhere,
  buildIntakeScopeWhere,
  buildIssueScopeWhere,
  buildUserScopeWhere,
  type ISdkGatewayScope,
} from "@utils/sdk-gateway-scope";

type Query = Record<string, any>;

const OPEN_GROUPS = ["backlog", "unstarted", "started"];

const isoDate = (d: unknown): string | null => {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : String(d);
};

const readPagination = (q: Query) => {
  const perPage = Math.min(Number(q.limit ?? 20), 100);
  const page = Math.max(Number(q.page ?? 0), 0);
  return { perPage, page, skip: page * perPage };
};

const buildPage = <T>(data: T[], page: number, total: number, perPage: number) => ({
  data,
  page,
  total,
  total_pages: Math.ceil(total / perPage),
});

const baseIssueWhere = (scope: ISdkGatewayScope): Record<string, any> => ({
  ...buildIssueScopeWhere(scope),
  deletedAt: null,
  isDraft: false,
});

const countIssueGroups = (where: Record<string, any>) =>
  Promise.all([
    prisma.issue.count({ where }),
    prisma.issue.count({ where: { ...where, state: { group: { in: OPEN_GROUPS } } } }),
    prisma.issue.count({ where: { ...where, state: { group: "completed" } } }),
  ]);

const serializeState = (s: any) => (s ? { id: s.id, name: s.name, group: s.group } : null);
const serializeLabels = (labels: any[] | undefined) =>
  (labels ?? []).map((l: any) => ({ id: l.label?.id, name: l.label?.name, color: l.label?.color }));

// ── Worker items (chamados) ───────────────────────────────────────────────────

const WORKER_ITEM_INCLUDE = {
  state: { select: { id: true, name: true, group: true, color: true } },
  assignees: { include: { assignee: { select: { id: true, displayName: true, email: true } } } },
  labels: { include: { label: { select: { id: true, name: true, color: true } } } },
} as const;

const buildSearchFilter = (search: string) =>
  [
    { name: { contains: search, mode: "insensitive" } },
    { sequenceId: isNaN(Number(search)) ? undefined : Number(search) },
  ].filter((c) => Object.values(c)[0] !== undefined);

export async function findWorkerItems(scope: ISdkGatewayScope, q: Query) {
  const where = baseIssueWhere(scope);
  if (q.entity_id) where.entityId = q.entity_id;
  if (q.status) where.state = { group: q.status };
  if (q.assignee_id) where.assignees = { some: { assigneeId: q.assignee_id } };
  if (q.search) where.OR = buildSearchFilter(q.search);

  const { perPage, page, skip } = readPagination(q);
  const [items, total] = await Promise.all([
    prisma.issue.findMany({ where, skip, take: perPage, orderBy: { updatedAt: "desc" }, include: WORKER_ITEM_INCLUDE }),
    prisma.issue.count({ where }),
  ]);

  const data = items.map((i: any) => ({
    id: i.id,
    sequence_id: i.sequenceId,
    name: i.name,
    priority: i.priority,
    state: serializeState(i.state),
    assignees: (i.assignees ?? []).map((a: any) => ({
      id: a.assignee?.id,
      display_name: a.assignee?.displayName,
      email: a.assignee?.email,
    })),
    labels: serializeLabels(i.labels),
    entity_id: i.entityId ?? null,
    created_at: isoDate(i.createdAt),
    updated_at: isoDate(i.updatedAt),
    completed_at: isoDate(i.completedAt),
  }));
  return buildPage(data, page, total, perPage);
}

export async function findWorkerItem(scope: ISdkGatewayScope, id: string) {
  const i: any = await prisma.issue.findFirst({
    where: { ...buildIssueScopeWhere(scope), id, deletedAt: null },
    include: WORKER_ITEM_INCLUDE,
  });
  if (!i) return null;
  return {
    id: i.id,
    sequence_id: i.sequenceId,
    name: i.name,
    description_html: i.descriptionHtml ?? null,
    priority: i.priority,
    state: serializeState(i.state),
    assignees: (i.assignees ?? []).map((a: any) => ({ id: a.assignee?.id, display_name: a.assignee?.displayName })),
    labels: serializeLabels(i.labels),
    entity_id: i.entityId ?? null,
    project_id: i.projectId,
    workspace_id: i.workspaceId,
    created_at: isoDate(i.createdAt),
    updated_at: isoDate(i.updatedAt),
    completed_at: isoDate(i.completedAt),
  };
}

export async function getWorkerItemStats(scope: ISdkGatewayScope, q: Query) {
  const where = baseIssueWhere(scope);
  if (q.entity_id) where.entityId = q.entity_id;
  const [[total, open, closed], byPriority] = await Promise.all([
    countIssueGroups(where),
    prisma.issue.groupBy({ by: ["priority"], where, _count: { id: true } }),
  ]);
  const by_priority = Object.fromEntries(byPriority.map((r: any) => [r.priority ?? "none", r._count.id]));
  return { total, open, closed, by_priority };
}

// ── Intakes (triagem) ─────────────────────────────────────────────────────────

const serializeIntake = (i: any) => ({
  id: i.id,
  name: i.name,
  description: i.description ?? null,
  project_id: i.projectId,
  workspace_id: i.workspaceId,
  created_at: isoDate(i.createdAt),
  updated_at: isoDate(i.updatedAt),
});

const baseIntakeWhere = (scope: ISdkGatewayScope): Record<string, any> => ({
  ...buildIntakeScopeWhere(scope),
  deletedAt: null,
});

export async function findIntakes(scope: ISdkGatewayScope, q: Query) {
  const where = baseIntakeWhere(scope);
  // AND: o filtro por projeto nunca alarga o recorte dos projetos do membro.
  if (q.project_id) where.AND = [{ projectId: q.project_id }];

  const { perPage, page, skip } = readPagination(q);
  const [items, total] = await Promise.all([
    prisma.intake.findMany({ where, skip, take: perPage, orderBy: { createdAt: "desc" } }),
    prisma.intake.count({ where }),
  ]);
  return buildPage(items.map(serializeIntake), page, total, perPage);
}

export async function findIntake(scope: ISdkGatewayScope, id: string) {
  const intake = await prisma.intake.findFirst({ where: { ...baseIntakeWhere(scope), id } });
  return intake ? serializeIntake(intake) : null;
}

export async function getIntakeStats(scope: ISdkGatewayScope) {
  return { total: await prisma.intake.count({ where: baseIntakeWhere(scope) }) };
}

// ── Actions (chamados, visão resumida) ────────────────────────────────────────

const ACTION_INCLUDE = { state: { select: { id: true, name: true, group: true } } } as const;

const serializeAction = (i: any) => ({
  id: i.id,
  name: i.name,
  priority: i.priority,
  state: serializeState(i.state),
  entity_id: i.entityId ?? null,
  created_at: isoDate(i.createdAt),
  updated_at: isoDate(i.updatedAt),
});

export async function findActions(scope: ISdkGatewayScope, q: Query) {
  const where = baseIssueWhere(scope);
  if (q.entity_id) where.entityId = q.entity_id;
  if (q.assignee_id) where.assignees = { some: { assigneeId: q.assignee_id } };

  const { perPage, page, skip } = readPagination(q);
  const [items, total] = await Promise.all([
    prisma.issue.findMany({ where, skip, take: perPage, orderBy: { updatedAt: "desc" }, include: ACTION_INCLUDE }),
    prisma.issue.count({ where }),
  ]);
  return buildPage(items.map(serializeAction), page, total, perPage);
}

export async function findAction(scope: ISdkGatewayScope, id: string) {
  const issue = await prisma.issue.findFirst({
    where: { ...buildIssueScopeWhere(scope), id, deletedAt: null },
    include: ACTION_INCLUDE,
  });
  return issue ? serializeAction(issue) : null;
}

export async function getActionStats(scope: ISdkGatewayScope) {
  const [total, open, closed] = await countIssueGroups(baseIssueWhere(scope));
  return { total, open, closed };
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function getStatsOverview(scope: ISdkGatewayScope) {
  const [[total, open, closed], intakesTotal] = await Promise.all([
    countIssueGroups(baseIssueWhere(scope)),
    prisma.intake.count({ where: baseIntakeWhere(scope) }),
  ]);
  return {
    worker_items_total: total,
    worker_items_open: open,
    worker_items_closed: closed,
    intakes_total: intakesTotal,
    actions_total: total,
  };
}

export async function getEntityStats(scope: ISdkGatewayScope, entityId: string) {
  const [total, open, closed] = await countIssueGroups({ ...baseIssueWhere(scope), entityId });
  return { entity_id: entityId, total, open, closed };
}

export async function getPeriodStats(scope: ISdkGatewayScope, startDate: string, endDate: string) {
  const where = { ...baseIssueWhere(scope), createdAt: { gte: new Date(startDate), lte: new Date(endDate) } };
  const [created, completed] = await Promise.all([
    prisma.issue.count({ where }),
    prisma.issue.count({ where: { ...where, completedAt: { not: null } } }),
  ]);
  return {
    start_date: startDate,
    end_date: endDate,
    worker_items_created: created,
    worker_items_completed: completed,
  };
}

// ── Users ─────────────────────────────────────────────────────────────────────

const USER_SELECT = { id: true, email: true, displayName: true, avatarUrl: true } as const;

const serializeUser = (u: any) => ({
  id: u.id,
  email: u.email,
  display_name: u.displayName,
  avatar_url: u.avatarUrl ?? null,
});

/** O próprio usuário: não depende de workspace. */
export async function findCurrentUser(userId: string) {
  const u: any = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...USER_SELECT, firstName: true, lastName: true },
  });
  if (!u) return null;
  return { ...serializeUser(u), first_name: u.firstName ?? "", last_name: u.lastName ?? "" };
}

const baseUserWhere = (scope: ISdkGatewayScope): Record<string, any> => ({
  ...buildUserScopeWhere(scope),
  isActive: true,
  deletedAt: null,
});

export async function findUsers(scope: ISdkGatewayScope, q: Query) {
  const where = baseUserWhere(scope);
  if (q.search) {
    where.OR = [
      { email: { contains: q.search, mode: "insensitive" } },
      { displayName: { contains: q.search, mode: "insensitive" } },
    ];
  }
  const { perPage, page, skip } = readPagination(q);
  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, skip, take: perPage, orderBy: { displayName: "asc" }, select: USER_SELECT }),
    prisma.user.count({ where }),
  ]);
  return buildPage(users.map(serializeUser), page, total, perPage);
}

export async function findUser(scope: ISdkGatewayScope, id: string) {
  const u = await prisma.user.findFirst({ where: { ...buildUserScopeWhere(scope), id }, select: USER_SELECT });
  return u ? serializeUser(u) : null;
}

// ── Entities ──────────────────────────────────────────────────────────────────

/** Cada gateway tem o seu contrato de entidade (o de plugin expõe os ids externos). */
export interface IEntityContract {
  select: Record<string, boolean>;
  serialize: (e: any) => unknown;
}

const INCLUI_INATIVAS = new Set(["1", "true"]);

/**
 * Quem deixou de ser cliente (inativa ou congelada) fica fora da lista por
 * padrão: painel, plugin e situação de backup só falam de cliente de verdade.
 * `include_inactive=1` libera todas, para cadastro e histórico.
 */
export const readFiltroDeAtividade = (q: Query): Record<string, unknown> =>
  INCLUI_INATIVAS.has(
    String(q.include_inactive ?? "")
      .trim()
      .toLowerCase()
  )
    ? {}
    : { isActive: true, frozenAt: null };

export async function findEntities(scope: ISdkGatewayScope, q: Query, contract: IEntityContract) {
  const where: Record<string, any> = { ...buildEntityScopeWhere(scope), deletedAt: null, ...readFiltroDeAtividade(q) };
  if (q.search) where.name = { contains: q.search, mode: "insensitive" };

  const { perPage, page, skip } = readPagination(q);
  const [entities, total] = await Promise.all([
    prisma.entity.findMany({ where, skip, take: perPage, orderBy: { name: "asc" }, select: contract.select }),
    prisma.entity.count({ where }),
  ]);
  return buildPage(entities.map(contract.serialize), page, total, perPage);
}

export async function findEntity(scope: ISdkGatewayScope, id: string, contract: IEntityContract) {
  const entity = await prisma.entity.findFirst({
    where: { ...buildEntityScopeWhere(scope), id, deletedAt: null },
    select: contract.select,
  });
  return entity ? contract.serialize(entity) : null;
}
