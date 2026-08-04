/**
 * Trilha de auditoria (LGPD) — consulta, exportação e registro de eventos de tela.
 *
 * Quem vê o quê:
 *  - `/audit-logs/`        → só administradores do workspace (dado de terceiros).
 *  - `/audit-logs/me/`     → qualquer membro vê os PRÓPRIOS acessos (direito de
 *    acesso do titular, art. 18 da LGPD).
 *  - `/audit-logs/export/` → administradores; devolve CSV para atender pedido de
 *    titular ou fiscalização.
 *  - `POST /audit-logs/`   → o frontend registra o que só acontece no cliente
 *    (impressão, exportação de tela). O ator é SEMPRE o usuário autenticado —
 *    nada de confiar em quem o cliente diz ser.
 */

import Elysia from "elysia";
import prisma from "@db";
import { authPlugin } from "@middleware/auth";
import { paginate } from "@utils/pagination";
import { getWorkspaceOrFail, requireWorkspaceMember } from "@utils/workspace";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, recordAudit, serializeAuditLog } from "@utils/audit";

const CLIENT_REPORTABLE_ACTIONS = new Set<string>([
  AUDIT_ACTIONS.PRINT,
  AUDIT_ACTIONS.EXPORT,
  AUDIT_ACTIONS.DOWNLOAD,
  AUDIT_ACTIONS.VIEW,
]);

const KNOWN_ENTITIES = new Set<string>(Object.values(AUDIT_ENTITIES));

function buildWhere(workspaceId: string, query: Record<string, unknown>) {
  const where: any = { workspaceId };
  if (query.entity) where.entity = String(query.entity);
  if (query.entity_id) where.entityId = String(query.entity_id);
  if (query.actor_id) where.actorId = String(query.actor_id);
  if (query.action) where.action = { in: String(query.action).split(",").filter(Boolean) };
  const from = query.date_from ? new Date(String(query.date_from)) : null;
  const to = query.date_to ? new Date(String(query.date_to)) : null;
  if (from && !isNaN(from.getTime())) where.createdAt = { gte: from };
  if (to && !isNaN(to.getTime())) where.createdAt = { ...(where.createdAt ?? {}), lte: to };
  return where;
}

function toCsv(rows: any[]): string {
  const header = ["data", "ator_id", "ator_email", "ip", "entidade", "entidade_id", "acao", "alteracoes", "metadados"];
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      r.createdAt?.toISOString?.() ?? r.createdAt,
      r.actorId ?? "",
      r.actorEmail ?? "",
      r.actorIp ?? "",
      r.entity,
      r.entityId,
      r.action,
      JSON.stringify(r.changes ?? {}),
      JSON.stringify(r.metadata ?? {}),
    ]
      .map(escape)
      .join(",")
  );
  return [header.join(","), ...lines].join("\n");
}

export const auditModule = new Elysia({ prefix: "/workspaces/:slug" })
  .use(authPlugin)

  .get("/audit-logs/", async ({ params: { slug }, user, query, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const member = await requireWorkspaceMember(ws.id, user.id);
    if (member.role < 20 && !user.isInstanceAdmin) {
      set.status = 403;
      return { detail: "Apenas administradores podem ver os registros de auditoria." };
    }
    const where = buildWhere(ws.id, query as Record<string, unknown>);
    return paginate({
      query: (skip, take) => prisma.auditLog.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      count: () => prisma.auditLog.count({ where }),
      cursor: query.cursor as string | undefined,
      transform: (items) => items.map(serializeAuditLog),
    });
  })

  // Direito de acesso do titular: o próprio usuário consulta o que fez/acessou.
  .get("/audit-logs/me/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where = { ...buildWhere(ws.id, query as Record<string, unknown>), actorId: user.id };
    return paginate({
      query: (skip, take) => prisma.auditLog.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      count: () => prisma.auditLog.count({ where }),
      cursor: query.cursor as string | undefined,
      transform: (items) => items.map(serializeAuditLog),
    });
  })

  .get("/audit-logs/export/", async ({ params: { slug }, user, query, set, headers }) => {
    const ws = await getWorkspaceOrFail(slug);
    const member = await requireWorkspaceMember(ws.id, user.id);
    if (member.role < 20 && !user.isInstanceAdmin) {
      set.status = 403;
      return { detail: "Apenas administradores podem exportar os registros de auditoria." };
    }
    const where = buildWhere(ws.id, query as Record<string, unknown>);
    const limit = Math.min(Number(query.limit ?? 10000), 50000);
    const rows = await prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: limit });

    // A própria exportação é um tratamento de dados e também vira registro.
    recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.AUDIT_LOG,
      entityId: ws.id,
      action: AUDIT_ACTIONS.EXPORT,
      actor: user,
      headers,
      metadata: { total: rows.length, filtros: where },
    });

    set.headers["Content-Type"] = "text/csv; charset=utf-8";
    set.headers["Content-Disposition"] = `attachment; filename="auditoria-${slug}-${new Date().toISOString().slice(0, 10)}.csv"`;
    return toCsv(rows);
  })

  // Eventos que só existem no cliente (imprimir/exportar uma tela).
  .post("/audit-logs/", async ({ params: { slug }, body, user, set, headers }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const b = (body ?? {}) as Record<string, unknown>;
    const action = String(b.action ?? "");
    const entity = String(b.entity ?? "");
    const entityId = String(b.entity_id ?? "");

    if (!CLIENT_REPORTABLE_ACTIONS.has(action)) {
      set.status = 400;
      return { detail: `Ação inválida. Aceitas: ${[...CLIENT_REPORTABLE_ACTIONS].join(", ")}.` };
    }
    if (!KNOWN_ENTITIES.has(entity)) {
      set.status = 400;
      return { detail: "Entidade inválida." };
    }
    if (!entityId) {
      set.status = 400;
      return { detail: "entity_id é obrigatório." };
    }

    await recordAudit({
      workspaceId: ws.id,
      entity,
      entityId,
      action,
      actor: user,
      headers,
      metadata: { ...(b.metadata as Record<string, unknown>), origem: "web" },
    });
    set.status = 201;
    return { registered: true };
  });
