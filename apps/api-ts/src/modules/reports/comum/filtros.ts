/**
 * Filtros comuns dos relatórios (`project_ids` em csv, `entity_id`, `date_from`,
 * `date_to`) e os nomes que quase todo relatório precisa resolver. Fonte única:
 * o `index.ts` dos relatórios antigos e os relatórios novos leem daqui.
 */
import prisma from "@db";
import { Prisma } from "@prisma/client";

export type Filters = {
  projectIds?: string[];
  entityId?: string;
  dateFrom?: Date;
  dateTo?: Date;
};

type Query = Record<string, unknown>;

const readData = (valor: unknown): Date | undefined => {
  if (!valor) return undefined;
  const d = new Date(String(valor));
  return isNaN(d.getTime()) ? undefined : d;
};

const readProjetos = (query: Query): string[] | undefined => {
  if (query.project_ids) {
    const ids = String(query.project_ids)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return ids.length ? ids : undefined;
  }
  return query.project_id ? [String(query.project_id)] : undefined;
};

export function parseFilters(query: Query): Filters {
  return {
    projectIds: readProjetos(query),
    entityId: query.entity_id ? String(query.entity_id) : undefined,
    dateFrom: readData(query.date_from),
    dateTo: readData(query.date_to),
  };
}

/** Texto opcional da query, sem espaços nas pontas; vazio vira undefined. */
export const readTexto = (valor: unknown): string | undefined =>
  valor ? String(valor).trim() || undefined : undefined;

// Prisma `where` para a tabela Issue a partir dos filtros comuns.
export function issueWhere(wsId: string, f: Filters, extra: Record<string, any> = {}) {
  const where: any = { workspaceId: wsId, deletedAt: null, isDraft: false, ...extra };
  if (f.projectIds) where.projectId = { in: f.projectIds };
  if (f.entityId) where.entityId = f.entityId;
  if (f.dateFrom || f.dateTo) {
    where.createdAt = {};
    if (f.dateFrom) where.createdAt.gte = f.dateFrom;
    if (f.dateTo) where.createdAt.lte = f.dateTo;
  }
  return where;
}

/** Os filtros de sistema e entidade, sem o período (para quem filtra por outra data). */
export const withoutPeriodo = (f: Filters): Filters => ({ projectIds: f.projectIds, entityId: f.entityId });

// Fragmento SQL com os mesmos filtros, para os $queryRaw (médias temporais).
export function issueSqlFilter(wsId: string, f: Filters): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`workspace_id = ${wsId}::uuid`,
    Prisma.sql`deleted_at IS NULL`,
    Prisma.sql`is_draft = false`,
  ];
  if (f.projectIds)
    clauses.push(Prisma.sql`project_id IN (${Prisma.join(f.projectIds.map((id) => Prisma.sql`${id}::uuid`))})`);
  if (f.entityId) clauses.push(Prisma.sql`entity_id = ${f.entityId}::uuid`);
  if (f.dateFrom) clauses.push(Prisma.sql`created_at >= ${f.dateFrom}`);
  if (f.dateTo) clauses.push(Prisma.sql`created_at <= ${f.dateTo}`);
  return Prisma.join(clauses, " AND ");
}

export function userName(
  u: { firstName?: string; lastName?: string; displayName?: string; email?: string } | null | undefined
) {
  if (!u) return "—";
  const full = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return full || u.displayName || u.email || "—";
}

export function round(n: number | null | undefined, digits = 2) {
  if (n === null || n === undefined || isNaN(Number(n))) return null;
  const f = 10 ** digits;
  return Math.round(Number(n) * f) / f;
}

// Helper p/ mapa de nomes de usuários a partir de uma lista de ids.
export async function userNameMap(ids: (string | null | undefined)[]) {
  const clean = [...new Set(ids.filter((x): x is string => !!x))];
  if (!clean.length) return new Map<string, string>();
  const users = await prisma.user.findMany({
    where: { id: { in: clean } },
    select: { id: true, firstName: true, lastName: true, displayName: true, email: true },
  });
  return new Map(users.map((u) => [u.id, userName(u)]));
}

// Helper p/ mapa de nomes de projetos.
export async function projectNameMap(wsId: string, ids: string[]) {
  if (!ids.length) return new Map<string, { name: string; identifier: string }>();
  const projects = await prisma.project.findMany({
    where: { id: { in: ids }, workspaceId: wsId },
    select: { id: true, name: true, identifier: true },
  });
  return new Map(projects.map((p) => [p.id, { name: p.name, identifier: p.identifier }]));
}

/** `null` vira null e o resto vira o nome; útil para "por" dos marcos. */
export const readNome = (nomes: Map<string, string>, id: string | null) => (id ? (nomes.get(id) ?? "—") : null);

export const toIso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
