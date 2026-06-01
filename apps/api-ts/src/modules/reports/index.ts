import Elysia from "elysia";
import prisma from "@db";
import { authPlugin } from "@middleware/auth";
import { getWorkspaceOrFail, requireWorkspaceMember } from "@utils/workspace";
import { Prisma } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// Relatórios gerenciais (SAC) — agregações sobre chamados, visitas, sistemas,
// entidades, usuários, tempo gasto, prioridade e interações.
// Todas as rotas: GET /workspaces/:slug/reports/<name>/
// Filtros comuns: project_ids (csv), entity_id, date_from, date_to.
// ─────────────────────────────────────────────────────────────────────────────

const PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const;
const STATE_GROUPS = ["backlog", "unstarted", "started", "completed", "cancelled"] as const;

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgente",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
  none: "Sem prioridade",
};

const GROUP_LABELS: Record<string, string> = {
  triage: "Triagem",
  backlog: "Backlog",
  unstarted: "Não iniciado",
  started: "Em andamento",
  completed: "Concluído",
  cancelled: "Cancelado",
};

type Filters = {
  projectIds?: string[];
  entityId?: string;
  dateFrom?: Date;
  dateTo?: Date;
};

function parseFilters(query: any): Filters {
  const f: Filters = {};
  if (query.project_ids) {
    const ids = String(query.project_ids).split(",").map((s: string) => s.trim()).filter(Boolean);
    if (ids.length) f.projectIds = ids;
  } else if (query.project_id) {
    f.projectIds = [String(query.project_id)];
  }
  if (query.entity_id) f.entityId = String(query.entity_id);
  if (query.date_from) {
    const d = new Date(String(query.date_from));
    if (!isNaN(d.getTime())) f.dateFrom = d;
  }
  if (query.date_to) {
    const d = new Date(String(query.date_to));
    if (!isNaN(d.getTime())) f.dateTo = d;
  }
  return f;
}

// Prisma `where` para a tabela Issue a partir dos filtros comuns.
function issueWhere(wsId: string, f: Filters, extra: Record<string, any> = {}) {
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

// Fragmento SQL com os mesmos filtros, para os $queryRaw (médias temporais).
function issueSqlFilter(wsId: string, f: Filters): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`workspace_id = ${wsId}::uuid`,
    Prisma.sql`deleted_at IS NULL`,
    Prisma.sql`is_draft = false`,
  ];
  if (f.projectIds) clauses.push(Prisma.sql`project_id IN (${Prisma.join(f.projectIds.map((id) => Prisma.sql`${id}::uuid`))})`);
  if (f.entityId) clauses.push(Prisma.sql`entity_id = ${f.entityId}::uuid`);
  if (f.dateFrom) clauses.push(Prisma.sql`created_at >= ${f.dateFrom}`);
  if (f.dateTo) clauses.push(Prisma.sql`created_at <= ${f.dateTo}`);
  return Prisma.join(clauses, " AND ");
}

function userName(u: { firstName?: string; lastName?: string; displayName?: string; email?: string } | null | undefined) {
  if (!u) return "—";
  const full = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return full || u.displayName || u.email || "—";
}

function round(n: number | null | undefined, digits = 2) {
  if (n === null || n === undefined || isNaN(Number(n))) return null;
  const f = 10 ** digits;
  return Math.round(Number(n) * f) / f;
}

// Helper p/ mapa de nomes de usuários a partir de uma lista de ids.
async function userNameMap(ids: (string | null | undefined)[]) {
  const clean = [...new Set(ids.filter((x): x is string => !!x))];
  if (!clean.length) return new Map<string, string>();
  const users = await prisma.user.findMany({
    where: { id: { in: clean } },
    select: { id: true, firstName: true, lastName: true, displayName: true, email: true },
  });
  return new Map(users.map((u) => [u.id, userName(u)]));
}

// Helper p/ mapa de nomes de projetos.
async function projectNameMap(wsId: string, ids: string[]) {
  if (!ids.length) return new Map<string, { name: string; identifier: string }>();
  const projects = await prisma.project.findMany({
    where: { id: { in: ids }, workspaceId: wsId },
    select: { id: true, name: true, identifier: true },
  });
  return new Map(projects.map((p) => [p.id, { name: p.name, identifier: p.identifier }]));
}

export const reportsModule = new Elysia({ prefix: "/workspaces/:slug/reports" })
  .use(authPlugin)

  // ── 1. Visão geral de chamados ──────────────────────────────────────────────
  .get("/tickets-overview/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const f = parseFilters(query);
    const where = issueWhere(ws.id, f);

    const [total, completed, cancelled, started, pending, byPriorityRaw] = await Promise.all([
      prisma.issue.count({ where }),
      prisma.issue.count({ where: { ...where, state: { group: "completed" } } }),
      prisma.issue.count({ where: { ...where, state: { group: "cancelled" } } }),
      prisma.issue.count({ where: { ...where, state: { group: "started" } } }),
      prisma.issue.count({ where: { ...where, state: { group: { in: ["backlog", "unstarted"] } } } }),
      prisma.issue.groupBy({ by: ["priority"], where, _count: { id: true } }),
    ]);

    const avgResolution = await prisma.$queryRaw<[{ avg: number | null }]>(
      Prisma.sql`SELECT AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 86400) as avg FROM issues WHERE ${issueSqlFilter(ws.id, f)} AND completed_at IS NOT NULL`
    );

    // distribuição por status (group)
    const byGroup = await prisma.issue.groupBy({ by: ["stateId"], where, _count: { id: true } });
    const stateIds = byGroup.map((g) => g.stateId).filter((x): x is string => !!x);
    const states = await prisma.state.findMany({ where: { id: { in: stateIds } }, select: { id: true, group: true } });
    const stateGroup = new Map(states.map((s) => [s.id, s.group]));
    const groupCounts: Record<string, number> = {};
    for (const g of byGroup) {
      const grp = g.stateId ? stateGroup.get(g.stateId) ?? "backlog" : "backlog";
      groupCounts[grp] = (groupCounts[grp] ?? 0) + g._count.id;
    }

    const priorityMap = new Map(byPriorityRaw.map((p) => [p.priority, p._count.id]));

    return {
      filters: query,
      kpis: {
        total,
        completed,
        cancelled,
        in_progress: started,
        pending,
        completion_rate: total ? round((completed / total) * 100, 1) : 0,
        avg_resolution_days: round(avgResolution[0]?.avg),
      },
      by_priority: PRIORITIES.map((p) => ({ key: p, label: PRIORITY_LABELS[p], count: priorityMap.get(p) ?? 0 })),
      by_status: STATE_GROUPS.map((g) => ({ key: g, label: GROUP_LABELS[g], count: groupCounts[g] ?? 0 })),
    };
  })

  // ── 2. Chamados por sistema (projeto) ───────────────────────────────────────
  .get("/by-system/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const f = parseFilters(query);
    const where = issueWhere(ws.id, f);

    const grouped = await prisma.issue.groupBy({ by: ["projectId"], where, _count: { id: true } });
    const projectIds = grouped.map((g) => g.projectId);
    const projMap = await projectNameMap(ws.id, projectIds);
    const total = grouped.reduce((acc, g) => acc + g._count.id, 0);

    const rows = await Promise.all(
      grouped.map(async (g) => {
        const projWhere = { ...where, projectId: g.projectId };
        const [completed, avgRow] = await Promise.all([
          prisma.issue.count({ where: { ...projWhere, state: { group: "completed" } } }),
          prisma.$queryRaw<[{ avg: number | null }]>(
            Prisma.sql`SELECT AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 86400) as avg FROM issues WHERE ${issueSqlFilter(ws.id, f)} AND project_id = ${g.projectId}::uuid AND completed_at IS NOT NULL`
          ),
        ]);
        const meta = projMap.get(g.projectId);
        return {
          project_id: g.projectId,
          name: meta?.name ?? "—",
          identifier: meta?.identifier ?? "",
          total: g._count.id,
          percentage: total ? round((g._count.id / total) * 100, 1) : 0,
          completed,
          open: g._count.id - completed,
          avg_resolution_days: round(avgRow[0]?.avg),
        };
      })
    );
    rows.sort((a, b) => b.total - a.total);
    return { total, count: rows.length, rows };
  })

  // ── 3. Chamados por entidade (cliente) ──────────────────────────────────────
  .get("/by-entity/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const f = parseFilters(query);
    const where = issueWhere(ws.id, f);

    const grouped = await prisma.issue.groupBy({ by: ["entityId"], where, _count: { id: true } });
    const entityIds = grouped.map((g) => g.entityId).filter((x): x is string => !!x);
    const entities = await prisma.entity.findMany({
      where: { id: { in: entityIds } },
      select: { id: true, name: true, city: true, state: true },
    });
    const entMap = new Map(entities.map((e) => [e.id, e]));
    const total = grouped.reduce((acc, g) => acc + g._count.id, 0);

    const rows = await Promise.all(
      grouped.map(async (g) => {
        const entWhere = { ...where, entityId: g.entityId };
        const [completed, urgent, avgRow] = await Promise.all([
          prisma.issue.count({ where: { ...entWhere, state: { group: "completed" } } }),
          prisma.issue.count({ where: { ...entWhere, priority: { in: ["urgent", "high"] } } }),
          g.entityId
            ? prisma.$queryRaw<[{ avg: number | null }]>(
                Prisma.sql`SELECT AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 86400) as avg FROM issues WHERE ${issueSqlFilter(ws.id, f)} AND entity_id = ${g.entityId}::uuid AND completed_at IS NOT NULL`
              )
            : Promise.resolve([{ avg: null }] as [{ avg: number | null }]),
        ]);
        const meta = g.entityId ? entMap.get(g.entityId) : null;
        return {
          entity_id: g.entityId,
          name: meta?.name ?? "Sem entidade",
          city: meta?.city ?? null,
          state: meta?.state ?? null,
          total: g._count.id,
          percentage: total ? round((g._count.id / total) * 100, 1) : 0,
          completed,
          open: g._count.id - completed,
          high_priority: urgent,
          avg_resolution_days: round(avgRow[0]?.avg),
        };
      })
    );
    rows.sort((a, b) => b.total - a.total);
    return { total, count: rows.length, rows };
  })

  // ── 4. Chamados por prioridade / urgência ───────────────────────────────────
  .get("/by-priority/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const f = parseFilters(query);
    const where = issueWhere(ws.id, f);

    const rows = await Promise.all(
      PRIORITIES.map(async (p) => {
        const pWhere = { ...where, priority: p };
        const [count, completed, avgRow] = await Promise.all([
          prisma.issue.count({ where: pWhere }),
          prisma.issue.count({ where: { ...pWhere, state: { group: "completed" } } }),
          prisma.$queryRaw<[{ avg: number | null }]>(
            Prisma.sql`SELECT AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 86400) as avg FROM issues WHERE ${issueSqlFilter(ws.id, f)} AND priority = ${p} AND completed_at IS NOT NULL`
          ),
        ]);
        return {
          key: p,
          label: PRIORITY_LABELS[p],
          total: count,
          completed,
          open: count - completed,
          avg_resolution_days: round(avgRow[0]?.avg),
        };
      })
    );

    // lista crítica: urgentes/altos abertos há mais tempo
    const critical = await prisma.issue.findMany({
      where: { ...where, priority: { in: ["urgent", "high"] }, state: { group: { notIn: ["completed", "cancelled"] } } },
      select: {
        id: true, name: true, priority: true, createdAt: true, sequenceId: true,
        legacyTicketNumber: true, project: { select: { name: true, identifier: true } },
        entity: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 25,
    });
    const now = Date.now();
    const criticalList = critical.map((i) => ({
      id: i.id,
      name: i.name,
      sequence_id: i.sequenceId,
      legacy_ticket_number: i.legacyTicketNumber,
      priority: i.priority,
      priority_label: PRIORITY_LABELS[i.priority] ?? i.priority,
      project: i.project?.name ?? null,
      entity: i.entity?.name ?? null,
      created_at: i.createdAt,
      age_days: round((now - new Date(i.createdAt).getTime()) / 86400000, 0),
    }));

    return { rows, critical: criticalList };
  })

  // ── 5. Chamados por tipo de atividade (labels) ──────────────────────────────
  .get("/by-type/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const f = parseFilters(query);
    const where = issueWhere(ws.id, f);

    const issues = await prisma.issue.findMany({
      where,
      select: {
        id: true, completedAt: true, createdAt: true,
        labels: { where: { deletedAt: null }, select: { label: { select: { id: true, name: true, color: true } } } },
      },
    });

    const byLabel = new Map<string, { id: string; name: string; color: string; total: number; completed: number; resolutionDaysSum: number; resolutionCount: number }>();
    let untagged = 0;
    for (const issue of issues) {
      if (!issue.labels.length) { untagged++; continue; }
      for (const l of issue.labels) {
        const lab = l.label;
        if (!lab) continue;
        const cur = byLabel.get(lab.id) ?? { id: lab.id, name: lab.name, color: lab.color, total: 0, completed: 0, resolutionDaysSum: 0, resolutionCount: 0 };
        cur.total++;
        if (issue.completedAt) {
          cur.completed++;
          cur.resolutionDaysSum += (new Date(issue.completedAt).getTime() - new Date(issue.createdAt).getTime()) / 86400000;
          cur.resolutionCount++;
        }
        byLabel.set(lab.id, cur);
      }
    }
    const rows = [...byLabel.values()]
      .map((r) => ({
        label_id: r.id,
        name: r.name,
        color: r.color,
        total: r.total,
        completed: r.completed,
        open: r.total - r.completed,
        avg_resolution_days: r.resolutionCount ? round(r.resolutionDaysSum / r.resolutionCount) : null,
      }))
      .sort((a, b) => b.total - a.total);

    return { total_issues: issues.length, untagged, rows };
  })

  // ── 6. Produtividade por usuário/técnico ────────────────────────────────────
  .get("/productivity/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const f = parseFilters(query);

    // chamados atribuídos por responsável (via IssueAssignee)
    const assigned = await prisma.issueAssignee.findMany({
      where: { deletedAt: null, issue: issueWhere(ws.id, f) },
      select: {
        assigneeId: true,
        issue: { select: { id: true, completedAt: true, createdAt: true } },
      },
    });

    const agg = new Map<string, { assigned: number; completed: number; resolutionDaysSum: number; resolutionCount: number }>();
    for (const a of assigned) {
      const cur = agg.get(a.assigneeId) ?? { assigned: 0, completed: 0, resolutionDaysSum: 0, resolutionCount: 0 };
      cur.assigned++;
      if (a.issue.completedAt) {
        cur.completed++;
        cur.resolutionDaysSum += (new Date(a.issue.completedAt).getTime() - new Date(a.issue.createdAt).getTime()) / 86400000;
        cur.resolutionCount++;
      }
      agg.set(a.assigneeId, cur);
    }

    // tempo registrado por usuário (IssueTimeLog)
    const timeWhere: any = { issue: issueWhere(ws.id, f) };
    const timeByUser = await prisma.issueTimeLog.groupBy({
      by: ["memberId"],
      where: timeWhere,
      _sum: { durationMinutes: true },
    });
    const timeMap = new Map(timeByUser.map((t) => [t.memberId, t._sum.durationMinutes ?? 0]));

    // interações por usuário (IssueComment)
    const commentsByUser = await prisma.issueComment.groupBy({
      by: ["actorId"],
      where: { deletedAt: null, issue: issueWhere(ws.id, f) },
      _count: { id: true },
    });
    const commentMap = new Map(commentsByUser.map((c) => [c.actorId, c._count.id]));

    const ids = [...new Set([...agg.keys(), ...timeMap.keys(), ...[...commentMap.keys()].filter((x): x is string => !!x)])];
    const names = await userNameMap(ids);

    const rows = ids
      .map((id) => {
        const a = agg.get(id);
        const minutes = timeMap.get(id) ?? 0;
        return {
          user_id: id,
          name: names.get(id) ?? "—",
          assigned: a?.assigned ?? 0,
          completed: a?.completed ?? 0,
          completion_rate: a?.assigned ? round((a.completed / a.assigned) * 100, 1) : 0,
          avg_resolution_days: a?.resolutionCount ? round(a.resolutionDaysSum / a.resolutionCount) : null,
          logged_minutes: minutes,
          logged_hours: round(minutes / 60, 1),
          interactions: commentMap.get(id) ?? 0,
        };
      })
      .sort((a, b) => b.assigned - a.assigned);

    return { count: rows.length, rows };
  })

  // ── 7. Tempo gasto (time tracking) ──────────────────────────────────────────
  .get("/time-tracking/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const f = parseFilters(query);

    // filtro adicional por loggedDate dentro do período (se informado)
    const logWhere: any = { issue: issueWhere(ws.id, f) };
    if (f.dateFrom || f.dateTo) {
      logWhere.loggedDate = {};
      if (f.dateFrom) logWhere.loggedDate.gte = f.dateFrom;
      if (f.dateTo) logWhere.loggedDate.lte = f.dateTo;
    }

    const [totalAgg, byUser, byProject] = await Promise.all([
      prisma.issueTimeLog.aggregate({ where: logWhere, _sum: { durationMinutes: true }, _count: { id: true } }),
      prisma.issueTimeLog.groupBy({ by: ["memberId"], where: logWhere, _sum: { durationMinutes: true } }),
      prisma.issueTimeLog.groupBy({ by: ["projectId"], where: logWhere, _sum: { durationMinutes: true } }),
    ]);

    const userNames = await userNameMap(byUser.map((u) => u.memberId));
    const projNames = await projectNameMap(ws.id, byProject.map((p) => p.projectId));

    const totalMinutes = totalAgg._sum.durationMinutes ?? 0;

    // top chamados por tempo
    const topIssuesRaw = await prisma.issueTimeLog.groupBy({
      by: ["issueId"],
      where: logWhere,
      _sum: { durationMinutes: true },
      orderBy: { _sum: { durationMinutes: "desc" } },
      take: 15,
    });
    const topIssueIds = topIssuesRaw.map((t) => t.issueId);
    const topIssues = await prisma.issue.findMany({
      where: { id: { in: topIssueIds } },
      select: { id: true, name: true, sequenceId: true, legacyTicketNumber: true, project: { select: { name: true, identifier: true } } },
    });
    const issueMeta = new Map(topIssues.map((i) => [i.id, i]));

    return {
      kpis: {
        total_minutes: totalMinutes,
        total_hours: round(totalMinutes / 60, 1),
        entries: totalAgg._count.id,
        avg_minutes_per_entry: totalAgg._count.id ? round(totalMinutes / totalAgg._count.id, 1) : 0,
      },
      by_user: byUser
        .map((u) => ({ user_id: u.memberId, name: userNames.get(u.memberId) ?? "—", minutes: u._sum.durationMinutes ?? 0, hours: round((u._sum.durationMinutes ?? 0) / 60, 1) }))
        .sort((a, b) => b.minutes - a.minutes),
      by_system: byProject
        .map((p) => ({ project_id: p.projectId, name: projNames.get(p.projectId)?.name ?? "—", minutes: p._sum.durationMinutes ?? 0, hours: round((p._sum.durationMinutes ?? 0) / 60, 1) }))
        .sort((a, b) => b.minutes - a.minutes),
      top_issues: topIssuesRaw.map((t) => {
        const m = issueMeta.get(t.issueId);
        return {
          issue_id: t.issueId,
          name: m?.name ?? "—",
          sequence_id: m?.sequenceId ?? null,
          legacy_ticket_number: m?.legacyTicketNumber ?? null,
          project: m?.project?.name ?? null,
          minutes: t._sum.durationMinutes ?? 0,
          hours: round((t._sum.durationMinutes ?? 0) / 60, 1),
        };
      }),
    };
  })

  // ── 8. Interações / mensagens ───────────────────────────────────────────────
  .get("/interactions/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const f = parseFilters(query);
    const commentWhere: any = { deletedAt: null, issue: issueWhere(ws.id, f) };

    const [totalComments, totalIssues, byIssueRaw, byUser, byProject] = await Promise.all([
      prisma.issueComment.count({ where: commentWhere }),
      prisma.issue.count({ where: issueWhere(ws.id, f) }),
      prisma.issueComment.groupBy({ by: ["issueId"], where: commentWhere, _count: { id: true }, orderBy: { _count: { id: "desc" } }, take: 15 }),
      prisma.issueComment.groupBy({ by: ["actorId"], where: commentWhere, _count: { id: true } }),
      prisma.issueComment.groupBy({ by: ["projectId"], where: commentWhere, _count: { id: true } }),
    ]);

    const topIssueIds = byIssueRaw.map((i) => i.issueId);
    const topIssues = await prisma.issue.findMany({
      where: { id: { in: topIssueIds } },
      select: { id: true, name: true, sequenceId: true, legacyTicketNumber: true, project: { select: { name: true } }, entity: { select: { name: true } } },
    });
    const issueMeta = new Map(topIssues.map((i) => [i.id, i]));
    const userNames = await userNameMap(byUser.map((u) => u.actorId));
    const projNames = await projectNameMap(ws.id, byProject.map((p) => p.projectId));

    return {
      kpis: {
        total_interactions: totalComments,
        total_issues: totalIssues,
        avg_per_issue: totalIssues ? round(totalComments / totalIssues, 1) : 0,
      },
      most_active_issues: byIssueRaw.map((i) => {
        const m = issueMeta.get(i.issueId);
        return {
          issue_id: i.issueId,
          name: m?.name ?? "—",
          sequence_id: m?.sequenceId ?? null,
          legacy_ticket_number: m?.legacyTicketNumber ?? null,
          project: m?.project?.name ?? null,
          entity: m?.entity?.name ?? null,
          interactions: i._count.id,
        };
      }),
      by_user: byUser
        .filter((u) => u.actorId)
        .map((u) => ({ user_id: u.actorId, name: userNames.get(u.actorId!) ?? "—", interactions: u._count.id }))
        .sort((a, b) => b.interactions - a.interactions),
      by_system: byProject
        .map((p) => ({ project_id: p.projectId, name: projNames.get(p.projectId)?.name ?? "—", interactions: p._count.id }))
        .sort((a, b) => b.interactions - a.interactions),
    };
  })

  // ── 9. Visão geral de visitas técnicas ──────────────────────────────────────
  .get("/visits-overview/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const f = parseFilters(query);

    const where: any = { workspaceId: ws.id, deletedAt: null };
    if (f.entityId) where.entityId = f.entityId;
    if (f.dateFrom || f.dateTo) {
      where.scheduledDate = {};
      if (f.dateFrom) where.scheduledDate.gte = f.dateFrom;
      if (f.dateTo) where.scheduledDate.lte = f.dateTo;
    }

    const VISIT_STATUS_LABELS: Record<number, string> = {
      0: "Agendada", 1: "Em Andamento", 2: "Relatório em Elaboração", 3: "Aguardando Assinatura", 4: "Concluída", 5: "Cancelada",
    };

    const visits = await prisma.technicalVisit.findMany({
      where,
      select: {
        id: true, status: true, city: true, technicianId: true, entityId: true,
        startedAt: true, finishedAt: true, scheduledDate: true,
        motUpdate: true, motBugFix: true, motTraining: true, motImprovement: true, motCommercial: true, motOther: true,
        entity: { select: { name: true } },
      },
    });

    const byStatus: Record<number, number> = {};
    const byCity = new Map<string, number>();
    const byTech = new Map<string, number>();
    const byEntity = new Map<string, number>();
    const motives = { update: 0, bug_fix: 0, training: 0, improvement: 0, commercial: 0, other: 0 };
    let durationSum = 0, durationCount = 0;

    for (const v of visits) {
      byStatus[v.status] = (byStatus[v.status] ?? 0) + 1;
      if (v.city) byCity.set(v.city, (byCity.get(v.city) ?? 0) + 1);
      if (v.technicianId) byTech.set(v.technicianId, (byTech.get(v.technicianId) ?? 0) + 1);
      const entName = v.entity?.name ?? "Sem entidade";
      byEntity.set(entName, (byEntity.get(entName) ?? 0) + 1);
      if (v.motUpdate) motives.update++;
      if (v.motBugFix) motives.bug_fix++;
      if (v.motTraining) motives.training++;
      if (v.motImprovement) motives.improvement++;
      if (v.motCommercial) motives.commercial++;
      if (v.motOther) motives.other++;
      if (v.startedAt && v.finishedAt) {
        durationSum += (new Date(v.finishedAt).getTime() - new Date(v.startedAt).getTime()) / 3600000;
        durationCount++;
      }
    }

    const techNames = await userNameMap([...byTech.keys()]);

    return {
      kpis: {
        total: visits.length,
        completed: byStatus[4] ?? 0,
        scheduled: byStatus[0] ?? 0,
        cancelled: byStatus[5] ?? 0,
        avg_duration_hours: durationCount ? round(durationSum / durationCount, 1) : null,
      },
      by_status: Object.entries(byStatus).map(([k, count]) => ({ status: Number(k), label: VISIT_STATUS_LABELS[Number(k)] ?? "—", count })),
      by_motive: [
        { key: "update", label: "Atualização", count: motives.update },
        { key: "bug_fix", label: "Correção de Erros", count: motives.bug_fix },
        { key: "training", label: "Treinamento/Acompanhamento", count: motives.training },
        { key: "improvement", label: "Solicitação de Melhoria", count: motives.improvement },
        { key: "commercial", label: "Comercial", count: motives.commercial },
        { key: "other", label: "Outros", count: motives.other },
      ],
      by_technician: [...byTech.entries()].map(([id, count]) => ({ technician_id: id, name: techNames.get(id) ?? "—", count })).sort((a, b) => b.count - a.count),
      by_entity: [...byEntity.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      by_city: [...byCity.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    };
  })

  // ── 10. Tendência temporal (criados vs concluídos por mês) ──────────────────
  .get("/trends/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const f = parseFilters(query);
    // janela padrão: últimos 12 meses se não informado
    const filter = issueSqlFilter(ws.id, { projectIds: f.projectIds, entityId: f.entityId });

    const created = await prisma.$queryRaw<{ bucket: Date; count: bigint }[]>(
      Prisma.sql`SELECT date_trunc('month', created_at) AS bucket, COUNT(*) AS count FROM issues WHERE ${filter} AND created_at >= (NOW() - INTERVAL '12 months') GROUP BY bucket ORDER BY bucket`
    );
    const completed = await prisma.$queryRaw<{ bucket: Date; count: bigint }[]>(
      Prisma.sql`SELECT date_trunc('month', completed_at) AS bucket, COUNT(*) AS count FROM issues WHERE ${filter} AND completed_at IS NOT NULL AND completed_at >= (NOW() - INTERVAL '12 months') GROUP BY bucket ORDER BY bucket`
    );

    const createdMap = new Map(created.map((r) => [new Date(r.bucket).toISOString().slice(0, 7), Number(r.count)]));
    const completedMap = new Map(completed.map((r) => [new Date(r.bucket).toISOString().slice(0, 7), Number(r.count)]));
    const keys = [...new Set([...createdMap.keys(), ...completedMap.keys()])].sort();

    const series = keys.map((k) => ({
      month: k,
      created: createdMap.get(k) ?? 0,
      completed: completedMap.get(k) ?? 0,
      net: (createdMap.get(k) ?? 0) - (completedMap.get(k) ?? 0),
    }));

    return { series };
  })

  // ── 11. Backlog aging ───────────────────────────────────────────────────────
  .get("/backlog-aging/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const f = parseFilters(query);
    const where = issueWhere(ws.id, f, { state: { group: { notIn: ["completed", "cancelled"] } } });

    const open = await prisma.issue.findMany({
      where,
      select: { id: true, name: true, createdAt: true, priority: true, sequenceId: true, legacyTicketNumber: true, project: { select: { name: true } }, entity: { select: { name: true } } },
    });

    const now = Date.now();
    const buckets = { "0-7": 0, "8-30": 0, "31-90": 0, "90+": 0 };
    const oldest: any[] = [];
    for (const i of open) {
      const ageDays = (now - new Date(i.createdAt).getTime()) / 86400000;
      if (ageDays <= 7) buckets["0-7"]++;
      else if (ageDays <= 30) buckets["8-30"]++;
      else if (ageDays <= 90) buckets["31-90"]++;
      else buckets["90+"]++;
      oldest.push({
        id: i.id, name: i.name, sequence_id: i.sequenceId, legacy_ticket_number: i.legacyTicketNumber,
        priority: i.priority, priority_label: PRIORITY_LABELS[i.priority] ?? i.priority,
        project: i.project?.name ?? null, entity: i.entity?.name ?? null,
        age_days: Math.round(ageDays),
      });
    }
    oldest.sort((a, b) => b.age_days - a.age_days);

    return {
      total_open: open.length,
      buckets: [
        { range: "0-7 dias", key: "0-7", count: buckets["0-7"] },
        { range: "8-30 dias", key: "8-30", count: buckets["8-30"] },
        { range: "31-90 dias", key: "31-90", count: buckets["31-90"] },
        { range: "90+ dias", key: "90+", count: buckets["90+"] },
      ],
      oldest: oldest.slice(0, 25),
    };
  })

  // ── 12. SLA / tempo de resolução ────────────────────────────────────────────
  .get("/sla/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const f = parseFilters(query);
    const filter = issueSqlFilter(ws.id, f);

    const rows = await prisma.$queryRaw<{ hours: number }[]>(
      Prisma.sql`SELECT EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600 AS hours FROM issues WHERE ${filter} AND completed_at IS NOT NULL`
    );

    const bands = { le24: 0, le72: 0, le168: 0, gt168: 0 };
    let sum = 0;
    for (const r of rows) {
      const h = Number(r.hours);
      sum += h;
      if (h <= 24) bands.le24++;
      else if (h <= 72) bands.le72++;
      else if (h <= 168) bands.le168++;
      else bands.gt168++;
    }
    const totalResolved = rows.length;

    // por prioridade — tempo médio
    const byPriority = await Promise.all(
      PRIORITIES.map(async (p) => {
        const r = await prisma.$queryRaw<[{ avg: number | null; cnt: bigint }]>(
          Prisma.sql`SELECT AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600) AS avg, COUNT(*) AS cnt FROM issues WHERE ${filter} AND priority = ${p} AND completed_at IS NOT NULL`
        );
        return { key: p, label: PRIORITY_LABELS[p], avg_resolution_hours: round(r[0]?.avg), resolved: Number(r[0]?.cnt ?? 0) };
      })
    );

    return {
      kpis: {
        total_resolved: totalResolved,
        avg_resolution_hours: totalResolved ? round(sum / totalResolved, 1) : null,
        pct_within_24h: totalResolved ? round((bands.le24 / totalResolved) * 100, 1) : 0,
        pct_within_72h: totalResolved ? round(((bands.le24 + bands.le72) / totalResolved) * 100, 1) : 0,
      },
      bands: [
        { range: "≤ 24h", count: bands.le24 },
        { range: "24h – 72h", count: bands.le72 },
        { range: "72h – 7 dias", count: bands.le168 },
        { range: "> 7 dias", count: bands.gt168 },
      ],
      by_priority: byPriority,
    };
  })

  // ── 13. Dashboard executivo (consolidado) ───────────────────────────────────
  .get("/executive/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const f = parseFilters(query);
    const where = issueWhere(ws.id, f);

    const [total, completed, openUrgent, openTotal, avgRes, totalTime, totalVisits, byProject, byEntity] = await Promise.all([
      prisma.issue.count({ where }),
      prisma.issue.count({ where: { ...where, state: { group: "completed" } } }),
      prisma.issue.count({ where: { ...where, priority: { in: ["urgent", "high"] }, state: { group: { notIn: ["completed", "cancelled"] } } } }),
      prisma.issue.count({ where: { ...where, state: { group: { notIn: ["completed", "cancelled"] } } } }),
      prisma.$queryRaw<[{ avg: number | null }]>(
        Prisma.sql`SELECT AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 86400) as avg FROM issues WHERE ${issueSqlFilter(ws.id, f)} AND completed_at IS NOT NULL`
      ),
      prisma.issueTimeLog.aggregate({ where: { issue: where }, _sum: { durationMinutes: true } }),
      prisma.technicalVisit.count({ where: { workspaceId: ws.id, deletedAt: null } }),
      prisma.issue.groupBy({ by: ["projectId"], where, _count: { id: true }, orderBy: { _count: { id: "desc" } }, take: 5 }),
      prisma.issue.groupBy({ by: ["entityId"], where, _count: { id: true }, orderBy: { _count: { id: "desc" } }, take: 5 }),
    ]);

    const projNames = await projectNameMap(ws.id, byProject.map((p) => p.projectId));
    const entityIds = byEntity.map((e) => e.entityId).filter((x): x is string => !!x);
    const entities = await prisma.entity.findMany({ where: { id: { in: entityIds } }, select: { id: true, name: true } });
    const entNames = new Map(entities.map((e) => [e.id, e.name]));
    const minutes = totalTime._sum.durationMinutes ?? 0;

    return {
      kpis: {
        total_tickets: total,
        completed,
        completion_rate: total ? round((completed / total) * 100, 1) : 0,
        open_total: openTotal,
        open_high_priority: openUrgent,
        avg_resolution_days: round(avgRes[0]?.avg),
        total_logged_hours: round(minutes / 60, 1),
        total_visits: totalVisits,
      },
      top_systems: byProject.map((p) => ({ project_id: p.projectId, name: projNames.get(p.projectId)?.name ?? "—", count: p._count.id })),
      top_entities: byEntity.map((e) => ({ entity_id: e.entityId, name: e.entityId ? entNames.get(e.entityId) ?? "—" : "Sem entidade", count: e._count.id })),
    };
  })

  // ── 14. Tempo em cada etapa (Triagem, Em Teste, Em Desenvolvimento…) ─────────
  // Reconstrói o tempo gasto por cada work item em cada estado a partir do
  // histórico de mudanças de estado (issue_activities field='state'). Estados
  // sem histórico (itens antigos pré-log) acumulam todo o tempo no estado atual.
  .get("/time-in-state/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const f = parseFilters(query);
    const where = issueWhere(ws.id, f);

    const issues = await prisma.issue.findMany({
      where,
      select: { id: true, createdAt: true, completedAt: true, state: { select: { name: true, group: true } } },
    });
    if (!issues.length) return { by_state: [], by_group: [] };

    const issueIds = issues.map((i) => i.id);
    const activities = await prisma.issueActivity.findMany({
      where: { issueId: { in: issueIds }, field: "state", deletedAt: null },
      select: { issueId: true, oldValue: true, newValue: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    const actsByIssue = new Map<string, typeof activities>();
    for (const a of activities) {
      const arr = actsByIssue.get(a.issueId) ?? [];
      arr.push(a);
      actsByIssue.set(a.issueId, arr);
    }

    // name → group (for labelling); built from current states + activity history
    const nameToGroup = new Map<string, string>();
    for (const i of issues) if (i.state?.name) nameToGroup.set(i.state.name, i.state.group);

    const now = Date.now();
    const stateAgg = new Map<string, { minutes: number; issues: Set<string> }>();
    const add = (name: string | null, fromTs: number, toTs: number, issueId: string) => {
      if (!name) return;
      const mins = Math.max(0, (toTs - fromTs) / 60000);
      const cur = stateAgg.get(name) ?? { minutes: 0, issues: new Set<string>() };
      cur.minutes += mins;
      cur.issues.add(issueId);
      stateAgg.set(name, cur);
    };

    for (const issue of issues) {
      const acts = actsByIssue.get(issue.id) ?? [];
      let lastTs = new Date(issue.createdAt).getTime();
      // Estado inicial: o oldValue da primeira atividade, ou o estado atual se não houver histórico
      let currentName: string | null = acts.length ? acts[0].oldValue : issue.state?.name ?? null;
      // Estado terminal (completed/cancelled) "congela" o tempo na conclusão
      const endTs = issue.completedAt ? new Date(issue.completedAt).getTime() : now;
      for (const a of acts) {
        const ts = new Date(a.createdAt).getTime();
        add(currentName, lastTs, ts, issue.id);
        currentName = a.newValue;
        lastTs = ts;
      }
      add(currentName, lastTs, endTs, issue.id);
    }

    const by_state = [...stateAgg.entries()]
      .map(([name, v]) => {
        const group = nameToGroup.get(name) ?? null;
        const count = v.issues.size;
        return {
          state_name: name,
          group,
          group_label: group ? GROUP_LABELS[group] ?? group : null,
          total_hours: round(v.minutes / 60, 1),
          avg_hours_per_item: count ? round(v.minutes / 60 / count, 1) : null,
          items_count: count,
        };
      })
      .sort((a, b) => (b.total_hours ?? 0) - (a.total_hours ?? 0));

    // agregação por grupo
    const groupAgg = new Map<string, { minutes: number }>();
    for (const s of by_state) {
      if (!s.group) continue;
      const cur = groupAgg.get(s.group) ?? { minutes: 0 };
      cur.minutes += (s.total_hours ?? 0) * 60;
      groupAgg.set(s.group, cur);
    }
    const GROUP_ORDER = ["triage", "backlog", "unstarted", "started", "completed", "cancelled"];
    const by_group = GROUP_ORDER.filter((g) => groupAgg.has(g)).map((g) => ({
      group: g,
      group_label: GROUP_LABELS[g] ?? g,
      total_hours: round((groupAgg.get(g)!.minutes) / 60, 1),
    }));

    return { by_state, by_group };
  });
