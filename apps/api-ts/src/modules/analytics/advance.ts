/**
 * Analytics avançada — os três endpoints que a tela de Análises consome.
 *
 * O frontend (`AnalyticsService`) sempre chamou `advance-analytics`,
 * `advance-analytics-stats` e `advance-analytics-charts`; nenhum existia no
 * backend TypeScript, então a tela abria com **todos os contadores zerados** e
 * os gráficos vazios, mesmo com 50 mil chamados na base.
 *
 * Formatos esperados (definidos em `packages/types/src/analytics.ts`):
 *  - `advance-analytics?tab=overview`    → contadores do espaço de trabalho
 *  - `advance-analytics?tab=work-items`  → contadores por grupo de etapa
 *  - `advance-analytics-charts?type=...` → `TChartData[]` ou `{schema, data}`
 *  - `advance-analytics-stats?type=...`  → uma linha por projeto/responsável
 */
import Elysia from "elysia";
import prisma from "@db";
import { authPlugin } from "@middleware/auth";
import { getWorkspaceOrFail, requireWorkspaceMember } from "@utils/workspace";

type Consulta = Record<string, unknown>;

/** Filtro base compartilhado por todos os endpoints desta tela. */
function filtroChamados(workspaceId: string, query: Consulta, projectId?: string) {
  const projetos = String(query.project_ids ?? "")
    .split(",")
    .filter(Boolean);

  return {
    workspaceId,
    deletedAt: null,
    isDraft: false,
    ...(projectId ? { projectId } : projetos.length ? { projectId: { in: projetos } } : {}),
    ...(query.cycle_id ? { cycleIssues: { some: { cycleId: String(query.cycle_id) } } } : {}),
    ...(query.module_id ? { moduleIssues: { some: { moduleId: String(query.module_id) } } } : {}),
  } as any;
}

/** Contadores da aba "Visão geral". */
async function visaoGeral(workspaceId: string, where: any) {
  const membros = { workspaceId, isActive: true, deletedAt: null };
  const [total_users, total_admins, total_members, total_guests, total_projects, total_work_items, total_cycles, total_intake] =
    await Promise.all([
      prisma.workspaceMember.count({ where: membros }),
      // Níveis do fork: 5 visualizador · 6 atendimento · 8 qualidade · 12 TI
      // · 15 membro · 18 gestor · 20 admin. De 6 para cima a pessoa trabalha
      // nos chamados; abaixo disso só consulta.
      prisma.workspaceMember.count({ where: { ...membros, role: { gte: 20 } } }),
      prisma.workspaceMember.count({ where: { ...membros, role: { gte: 6, lt: 20 } } }),
      prisma.workspaceMember.count({ where: { ...membros, role: { lt: 6 } } }),
      prisma.project.count({ where: { workspaceId, deletedAt: null, archivedAt: null } }),
      prisma.issue.count({ where }),
      prisma.cycle.count({ where: { workspaceId, deletedAt: null } }),
      prisma.intakeIssue.count({ where: { workspaceId, deletedAt: null } }),
    ]);

  return contadores({
    total_users,
    total_admins,
    total_members,
    total_guests,
    total_projects,
    total_work_items,
    total_cycles,
    total_intake,
  });
}

/**
 * Os cartões da tela leem `data[campo].count` (`IAnalyticsResponseFields`), não
 * um número solto: devolver o número cru deixava todos os contadores em zero.
 */
function contadores(valores: Record<string, number>) {
  return Object.fromEntries(Object.entries(valores).map(([k, v]) => [k, { count: v, filter_count: v }]));
}

/** Contadores da aba "Chamados", por grupo de etapa. */
async function porGrupoDeEtapa(where: any) {
  const contar = (group?: string | string[]) =>
    prisma.issue.count({
      where: group ? { ...where, state: { group: Array.isArray(group) ? { in: group } : group } } : where,
    });

  const [total_work_items, started_work_items, backlog_work_items, un_started_work_items, completed_work_items] =
    await Promise.all([
      contar(),
      contar("started"),
      contar(["backlog", "triage"]),
      contar("unstarted"),
      contar("completed"),
    ]);

  return contadores({ total_work_items, started_work_items, backlog_work_items, un_started_work_items, completed_work_items });
}

// ── Gráficos ────────────────────────────────────────────────────────────────

/**
 * Cada propriedade do eixo X sabe agrupar os chamados e nomear os grupos.
 * Mapa de estratégias em vez de um `switch` gigante: acrescentar uma dimensão
 * é adicionar uma entrada.
 */
type Agrupador = (where: any) => Promise<Array<{ key: string; name: string; count: number }>>;

const semRotulo = (valor: string | null) => valor ?? "none";

/** A prioridade é guardada em inglês no banco; os gráficos mostram em português. */
const PRIORIDADES = new Map([
  ["urgent", "Urgente"],
  ["high", "Alta"],
  ["medium", "Média"],
  ["low", "Baixa"],
  ["none", "Sem prioridade"],
]);

async function agruparPorColuna(
  where: any,
  coluna: "stateId" | "priority" | "projectId" | "createdById",
  nomear: (ids: string[]) => Promise<Map<string, string>>,
) {
  const linhas = await prisma.issue.groupBy({ by: [coluna], where, _count: { id: true } });
  const nomes = await nomear(linhas.map((l) => String((l as any)[coluna])).filter(Boolean));
  return linhas.map((l) => {
    const chave = semRotulo((l as any)[coluna]);
    return { key: chave, name: nomes.get(chave) ?? chave, count: l._count.id };
  });
}

const nomesDe = async (
  modelo: "state" | "project" | "user",
  ids: string[],
): Promise<Map<string, string>> => {
  if (!ids.length) return new Map();
  const registros =
    modelo === "state"
      ? await prisma.state.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      : modelo === "project"
        ? await prisma.project.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
        : await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } });
  return new Map(registros.map((r: any) => [r.id, r.name ?? r.displayName ?? r.id]));
};

const AGRUPADORES: Record<string, Agrupador> = {
  STATES: (where) => agruparPorColuna(where, "stateId", (ids) => nomesDe("state", ids)),
  PROJECTS: (where) => agruparPorColuna(where, "projectId", (ids) => nomesDe("project", ids)),
  CREATED_BY: (where) => agruparPorColuna(where, "createdById", (ids) => nomesDe("user", ids)),
  PRIORITY: (where) => agruparPorColuna(where, "priority", async () => PRIORIDADES),
  STATE_GROUPS: async (where) => {
    const linhas = await prisma.issue.groupBy({ by: ["stateId"], where, _count: { id: true } });
    const estados = await prisma.state.findMany({
      where: { id: { in: linhas.map((l) => l.stateId!).filter(Boolean) } },
      select: { id: true, group: true },
    });
    const grupoPorEstado = new Map(estados.map((e) => [e.id, e.group]));
    const acumulado = new Map<string, number>();
    for (const linha of linhas) {
      const grupo = grupoPorEstado.get(linha.stateId ?? "") ?? "none";
      acumulado.set(grupo, (acumulado.get(grupo) ?? 0) + linha._count.id);
    }
    return [...acumulado].map(([key, count]) => ({ key, name: key, count }));
  },
  ASSIGNEES: async (where) => {
    const linhas = await prisma.issueAssignee.groupBy({
      by: ["assigneeId"],
      where: { deletedAt: null, issue: where },
      _count: { id: true },
    });
    const nomes = await nomesDe("user", linhas.map((l) => l.assigneeId));
    return linhas.map((l) => ({ key: l.assigneeId, name: nomes.get(l.assigneeId) ?? l.assigneeId, count: l._count.id }));
  },
  LABELS: async (where) => {
    const linhas = await prisma.issueLabel.groupBy({
      by: ["labelId"],
      where: { deletedAt: null, issue: where },
      _count: { id: true },
    });
    const etiquetas = await prisma.label.findMany({
      where: { id: { in: linhas.map((l) => l.labelId) } },
      select: { id: true, name: true },
    });
    const nomes = new Map(etiquetas.map((e) => [e.id, e.name]));
    return linhas.map((l) => ({ key: l.labelId, name: nomes.get(l.labelId) ?? l.labelId, count: l._count.id }));
  },
};

/** Métricas do eixo Y que apenas restringem o conjunto contado. */
const RECORTE_METRICA: Record<string, (where: any) => any> = {
  WORK_ITEM_COUNT: (where) => where,
  PENDING_WORK_ITEM_COUNT: (where) => ({ ...where, state: { group: { in: ["backlog", "unstarted", "triage"] } } }),
  COMPLETED_WORK_ITEM_COUNT: (where) => ({ ...where, state: { group: "completed" } }),
  IN_PROGRESS_WORK_ITEM_COUNT: (where) => ({ ...where, state: { group: "started" } }),
};

/** Série diária de criados x concluídos, no formato `{schema, data}`. */
async function criadosVersusResolvidos(where: any) {
  const chamados = await prisma.issue.findMany({
    where,
    select: { createdAt: true, completedAt: true },
    take: 20000,
  });

  const dia = (d: Date) => d.toISOString().slice(0, 10);
  const serie = new Map<string, { created_issues: number; completed_issues: number }>();
  const registrar = (chave: string, campo: "created_issues" | "completed_issues") => {
    const atual = serie.get(chave) ?? { created_issues: 0, completed_issues: 0 };
    atual[campo] += 1;
    serie.set(chave, atual);
  };

  for (const chamado of chamados) {
    registrar(dia(chamado.createdAt), "created_issues");
    if (chamado.completedAt) registrar(dia(chamado.completedAt), "completed_issues");
  }

  const data = [...serie.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, valores]) => ({ key, name: key, count: valores.created_issues, ...valores }));

  return { schema: { created_issues: "Criados", completed_issues: "Resolvidos" }, data };
}

/** Uma linha por projeto (ou por responsável, na visão de um projeto só). */
async function tabelaDeChamados(where: any, porResponsavel: boolean) {
  const grupos = porResponsavel ? await AGRUPADORES.ASSIGNEES(where) : await AGRUPADORES.PROJECTS(where);

  return Promise.all(
    grupos.map(async (grupo) => {
      const recorte = porResponsavel
        ? { ...where, assignees: { some: { assigneeId: grupo.key, deletedAt: null } } }
        : { ...where, projectId: grupo.key };
      const contar = (group: string | string[]) =>
        prisma.issue.count({
          where: { ...recorte, state: { group: Array.isArray(group) ? { in: group } : group } },
        });
      const [cancelled, completed, backlog, unstarted, started] = await Promise.all([
        contar("cancelled"),
        contar("completed"),
        contar(["backlog", "triage"]),
        contar("unstarted"),
        contar("started"),
      ]);
      return {
        ...(porResponsavel
          ? { assignee_id: grupo.key, display_name: grupo.name }
          : { project_id: grupo.key, project__name: grupo.name }),
        cancelled_work_items: cancelled,
        completed_work_items: completed,
        backlog_work_items: backlog,
        un_started_work_items: unstarted,
        started_work_items: started,
      };
    }),
  );
}

// ── Rotas ───────────────────────────────────────────────────────────────────

/** Registra os três endpoints sob o prefixo dado (workspace ou projeto). */
function rotas(prefix: string, comProjeto: boolean) {
  return new Elysia({ prefix, name: `advance-analytics${comProjeto ? "-project" : ""}` })
    .use(authPlugin)

    .get("/advance-analytics", async ({ params, user, query }) => {
      const ws = await getWorkspaceOrFail((params as any).slug);
      await requireWorkspaceMember(ws.id, user.id);
      const where = filtroChamados(ws.id, query as Consulta, comProjeto ? (params as any).project_id : undefined);
      return query.tab === "work-items" ? porGrupoDeEtapa(where) : visaoGeral(ws.id, where);
    })

    .get("/advance-analytics-charts", async ({ params, user, query }) => {
      const ws = await getWorkspaceOrFail((params as any).slug);
      await requireWorkspaceMember(ws.id, user.id);
      const where = filtroChamados(ws.id, query as Consulta, comProjeto ? (params as any).project_id : undefined);

      // O radar fica ilegível com uma centena de eixos: mostramos os sistemas
      // com mais chamados (a tela rotula a lista de acordo).
      if (query.type === "projects") {
        const projetos = await AGRUPADORES.PROJECTS(where);
        return projetos.sort((a, b) => b.count - a.count).slice(0, 10);
      }
      if (query.type === "work-items") return criadosVersusResolvidos(where);

      // custom-work-items: eixos escolhidos pelo usuário.
      const agrupador = AGRUPADORES[String(query.x_axis ?? "PRIORITY")] ?? AGRUPADORES.PRIORITY;
      const recorte = RECORTE_METRICA[String(query.y_axis ?? "WORK_ITEM_COUNT")] ?? RECORTE_METRICA.WORK_ITEM_COUNT;
      const grupos = await agrupador(recorte(where));
      return { schema: { count: "Quantidade" }, data: grupos.sort((a, b) => b.count - a.count) };
    })

    .get("/advance-analytics-stats", async ({ params, user, query }) => {
      const ws = await getWorkspaceOrFail((params as any).slug);
      await requireWorkspaceMember(ws.id, user.id);
      const where = filtroChamados(ws.id, query as Consulta, comProjeto ? (params as any).project_id : undefined);
      return tabelaDeChamados(where, comProjeto);
    });
}

export const advanceAnalyticsModule = new Elysia()
  .use(rotas("/workspaces/:slug", false))
  .use(rotas("/workspaces/:slug/projects/:project_id", true));
