import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";
import { getWorkspaceOrFail, getProjectOrFail } from "@utils/workspace";
import { EProjectAction, requireProjectAction } from "@utils/permission-checks";
import { applyIssueFilters, normalizeFilters, restringirAoGrupo } from "@utils/filters";
import { resolverOrdenacao } from "@utils/issue-order";
import { dateOnly, isoDate, ISSUE_INCLUDE, serializeIssue } from "@utils/serialize";

// ── Helpers de contagem / distribuição ────────────────────────────────────────

const STATE_GROUPS = ["backlog", "unstarted", "started", "completed", "cancelled"] as const;
type TStateGroup = (typeof STATE_GROUPS)[number];

/** Chamado sem etapa cai em "backlog" — mesma convenção do módulo de módulos. */
const normalizarGrupo = (grupo?: string | null): TStateGroup =>
  STATE_GROUPS.includes(grupo as TStateGroup) ? (grupo as TStateGroup) : "backlog";

/**
 * Vínculos "vivos" do ciclo. Além do vínculo não estar na lixeira, o chamado
 * precisa estar fora da lixeira, não arquivado e não ser rascunho: é a mesma
 * regra do `issue_objects` do legado. Sem isso os números do progresso não
 * batem com o que o quadro do ciclo mostra.
 */
const vinculosVivosWhere = (cycleIds: string[]) => ({
  cycleId: { in: cycleIds },
  deletedAt: null,
  issue: { deletedAt: null, archivedAt: null, isDraft: false },
});

type TContagemPorEtapa = Record<TStateGroup, number> & { total: number };

const contadoresZerados = (): TContagemPorEtapa => ({
  backlog: 0,
  unstarted: 0,
  started: 0,
  completed: 0,
  cancelled: 0,
  total: 0,
});

/**
 * `EstimatePoint.value` é texto livre: uma escala numérica guarda "2", mas uma
 * escala de categorias guarda "Alto". Só o que converte para número entra na
 * soma — o resto vale zero, como no legado.
 */
export function valorDoPonto(valor?: string | null): number {
  const texto = (valor ?? "").trim();
  if (!texto) return 0;
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : 0;
}

/**
 * Tudo que a listagem de ciclos precisa saber sobre os chamados vinculados:
 * quantos há por etapa, quantos pontos de estimativa somam por etapa e quem são
 * os responsáveis (para os avatares do card).
 */
type TResumoCiclo = {
  chamados: TContagemPorEtapa;
  pontos: TContagemPorEtapa;
  responsaveis: string[];
};

const resumoZerado = (): TResumoCiclo => ({
  chamados: contadoresZerados(),
  pontos: contadoresZerados(),
  responsaveis: [],
});

/**
 * Resume os chamados de vários ciclos de uma vez. Recebe uma lista para que a
 * listagem não caia em N+1 (uma consulta por ciclo).
 */
async function resumirCiclos(cycleIds: string[]): Promise<Map<string, TResumoCiclo>> {
  const mapa = new Map<string, TResumoCiclo>(cycleIds.map((id) => [id, resumoZerado()]));
  if (!cycleIds.length) return mapa;

  const vinculos = await prisma.cycleIssue.findMany({
    where: vinculosVivosWhere(cycleIds),
    select: {
      cycleId: true,
      issue: {
        select: {
          state: { select: { group: true } },
          estimatePoint: { select: { value: true } },
          assignees: { where: { deletedAt: null }, select: { assigneeId: true } },
        },
      },
    },
  });

  const responsaveisPorCiclo = new Map<string, Set<string>>(cycleIds.map((id) => [id, new Set<string>()]));

  for (const vinculo of vinculos) {
    const resumo = mapa.get(vinculo.cycleId);
    if (!resumo) continue;

    const grupo = normalizarGrupo(vinculo.issue.state?.group);
    const pontos = valorDoPonto(vinculo.issue.estimatePoint?.value);

    resumo.chamados.total++;
    resumo.chamados[grupo]++;
    resumo.pontos.total += pontos;
    resumo.pontos[grupo] += pontos;

    const responsaveis = responsaveisPorCiclo.get(vinculo.cycleId);
    for (const vinculoResponsavel of vinculo.issue.assignees) responsaveis?.add(vinculoResponsavel.assigneeId);
  }

  for (const [cycleId, responsaveis] of responsaveisPorCiclo) {
    const resumo = mapa.get(cycleId);
    if (resumo) resumo.responsaveis = [...responsaveis];
  }
  return mapa;
}

/** Ids dos ciclos que este usuário marcou como favoritos. */
async function favoritosDoUsuario(workspaceId: string, userId: string, cycleIds: string[]): Promise<Set<string>> {
  if (!cycleIds.length) return new Set();
  const favoritos = await prisma.userFavorite.findMany({
    where: { workspaceId, userId, entityType: "cycle", entityId: { in: cycleIds }, deletedAt: null },
    select: { entityId: true },
  });
  return new Set(favoritos.map((f) => f.entityId));
}

type TTipoAnalise = "issues" | "points";

/**
 * Cada tipo de análise nomeia os mesmos três números de um jeito: contagem de
 * chamados fala em `*_issues`, pontos de estimativa em `*_estimates`. O mapa
 * evita duplicar o acumulador só para trocar as chaves.
 */
const CHAVES_DISTRIBUICAO: Record<TTipoAnalise, { total: string; pendente: string; concluido: string }> = {
  issues: { total: "total_issues", pendente: "pending_issues", concluido: "completed_issues" },
  points: { total: "total_estimates", pendente: "pending_estimates", concluido: "completed_estimates" },
};

/**
 * Acumulador de distribuição. Responsável, etiqueta e etapa somam exatamente a
 * mesma coisa mudando só a chave e os metadados — a fábrica evita três laços
 * praticamente idênticos. `peso` é 1 na análise por chamado e o valor do ponto
 * de estimativa na análise por pontos.
 */
function criarDistribuicao<TMeta extends object>(tipo: TTipoAnalise) {
  const chaves = CHAVES_DISTRIBUICAO[tipo];
  const baldes = new Map<string, { meta: TMeta; total: number; pendente: number; concluido: number }>();
  return {
    adicionar(chave: string, meta: TMeta, concluido: boolean, peso: number) {
      const balde = baldes.get(chave) ?? { meta, total: 0, pendente: 0, concluido: 0 };
      balde.total += peso;
      if (concluido) balde.concluido += peso;
      else balde.pendente += peso;
      baldes.set(chave, balde);
    },
    valores: () =>
      [...baldes.values()].map((balde) => ({
        ...balde.meta,
        [chaves.total]: balde.total,
        [chaves.pendente]: balde.pendente,
        [chaves.concluido]: balde.concluido,
      })),
  };
}

/** Lista com um item nulo quando vazia — é o balde "Nenhum" da distribuição. */
const ouNenhum = <T>(itens: T[]): (T | null)[] => (itens.length ? itens : [null]);

const DIA_MS = 24 * 60 * 60 * 1000;

/** Chave diária do gráfico ("2026-08-10"), sempre em UTC. */
const diaChave = (data: Date): string => data.toISOString().split("T")[0]!;

type TConclusao = { data: Date; peso: number };

/**
 * Burndown: para cada dia do ciclo, quanto ainda restava (chamados ou pontos).
 * Dias futuros ficam `null` para o gráfico parar a linha em hoje.
 *
 * Ciclo sem datas devolve gráfico vazio em vez de erro (o legado respondia 400):
 * ciclos em rascunho não têm datas e a tela de analytics não pode quebrar.
 */
function montarGraficoConclusao(
  inicio: Date | null,
  fim: Date | null,
  conclusoes: TConclusao[],
  total: number,
): Record<string, number | null> {
  if (!inicio || !fim) return {};

  // Ordenado para varrer com um ponteiro só; inclui conclusões anteriores ao
  // início do ciclo, que já entram descontadas no primeiro dia.
  const concluidos = conclusoes
    .map((c) => ({ dia: diaChave(c.data), peso: c.peso }))
    .sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));
  const hoje = diaChave(new Date());
  const grafico: Record<string, number | null> = {};

  let ponteiro = 0;
  let acumulado = 0;
  for (let instante = inicio.getTime(); instante <= fim.getTime(); instante += DIA_MS) {
    const chave = diaChave(new Date(instante));
    while (ponteiro < concluidos.length && concluidos[ponteiro]!.dia <= chave) {
      acumulado += concluidos[ponteiro]!.peso;
      ponteiro++;
    }
    grafico[chave] = chave > hoje ? null : total - acumulado;
  }
  return grafico;
}

// ── Serialização (contrato `ICycle` do frontend) ──────────────────────────────

type TStatusCiclo = "draft" | "upcoming" | "current" | "completed";

/**
 * O quadro de ciclos separa atual/próximo/encerrado pelo `status`, mas a coluna
 * do banco só guarda "draft" — quem manda são as datas. Sem derivar aqui, nenhum
 * ciclo aparece como "current" e a aba do ciclo ativo fica sempre vazia. A
 * ordem dos testes reproduz a tabela do legado, inclusive os casos com só uma
 * das datas preenchidas (que continuam sendo rascunho).
 */
function derivarStatus(inicio: Date | null, fim: Date | null): TStatusCiclo {
  const agora = Date.now();
  if (inicio && fim && inicio.getTime() <= agora && fim.getTime() >= agora) return "current";
  if (inicio && inicio.getTime() > agora) return "upcoming";
  if (fim && fim.getTime() < agora) return "completed";
  return "draft";
}

/** Números de progresso — o `TProgressSnapshot` do frontend. */
function instantaneoDeProgresso(resumo: TResumoCiclo): Record<string, number> {
  return {
    total_issues: resumo.chamados.total,
    backlog_issues: resumo.chamados.backlog,
    unstarted_issues: resumo.chamados.unstarted,
    started_issues: resumo.chamados.started,
    completed_issues: resumo.chamados.completed,
    cancelled_issues: resumo.chamados.cancelled,

    total_estimate_points: resumo.pontos.total,
    backlog_estimate_points: resumo.pontos.backlog,
    unstarted_estimate_points: resumo.pontos.unstarted,
    started_estimate_points: resumo.pontos.started,
    completed_estimate_points: resumo.pontos.completed,
    cancelled_estimate_points: resumo.pontos.cancelled,
  };
}

/**
 * Converte o ciclo do Prisma (camelCase) para o contrato `ICycle` do frontend
 * (snake_case). TODA rota de ciclo passa por aqui — o frontend tipa a resposta
 * como `ICycle` e quebra com o objeto cru do Prisma.
 */
function serializeCycle(cycle: any, resumo?: TResumoCiclo, favorito = false): Record<string, unknown> {
  const r = resumo ?? resumoZerado();
  return {
    id: cycle.id,
    name: cycle.name,
    description: cycle.description ?? "",

    start_date: dateOnly(cycle.startDate),
    end_date: dateOnly(cycle.endDate),
    status: derivarStatus(cycle.startDate ?? null, cycle.endDate ?? null),
    archived_at: isoDate(cycle.archivedAt),

    owned_by_id: cycle.ownedById,
    project_id: cycle.projectId,
    workspace_id: cycle.workspaceId,
    // A listagem do workspace já traz o projeto junto; a do projeto não precisa.
    project_detail: cycle.project
      ? { id: cycle.project.id, name: cycle.project.name, identifier: cycle.project.identifier }
      : { id: cycle.projectId },

    created_at: isoDate(cycle.createdAt),
    updated_at: isoDate(cycle.updatedAt),
    created_by: cycle.createdById ?? null,

    is_favorite: favorito,
    sort_order: 65535,
    view_props: { filters: {} },
    progress: [],
    progress_snapshot: null,
    version: 1,

    assignee_ids: r.responsaveis,

    ...instantaneoDeProgresso(r),
  };
}

/**
 * Serializa uma leva de ciclos resolvendo resumo e favoritos em bloco.
 * Exportada porque a listagem de ciclos do workspace (módulo de workspace)
 * responde o mesmo `ICycle[]` e não pode divergir deste contrato.
 */
export async function serializarCiclos(cycles: any[], workspaceId: string, userId: string) {
  const ids = cycles.map((c) => c.id);
  const [resumos, favoritos] = await Promise.all([resumirCiclos(ids), favoritosDoUsuario(workspaceId, userId, ids)]);
  return cycles.map((c) => serializeCycle(c, resumos.get(c.id), favoritos.has(c.id)));
}

const serializarCiclo = async (cycle: any, workspaceId: string, userId: string) =>
  (await serializarCiclos([cycle], workspaceId, userId))[0];

const serializeUserProperties = (props: any, cycleId: string, userId: string) => ({
  id: props?.id ?? null,
  cycle: cycleId,
  user: userId,
  filters: props?.filters ?? {},
  display_filters: props?.displayFilters ?? {},
  display_properties: props?.displayProperties ?? {},
  rich_filters: props?.richFilters ?? {},
});

// ── Chamados do ciclo (handlers compartilhados) ───────────────────────────────
//
// O frontend chama `cycle-issues/` (nome do legado) e a API já expunha
// `issues/`. Os dois caminhos apontam para estes handlers — nada é duplicado.

/**
 * Agrupamentos aceitos pelo quadro do ciclo. Cada estratégia sabe listar os
 * valores possíveis e recortar o `where` para um deles. Agrupamento que não
 * estiver aqui cai na resposta plana — melhor que devolver grupos inventados.
 */
type TAgrupamento = {
  valores: (projectId: string) => Promise<(string | null)[]>;
  recorte: (where: any, valor: string | null, projectId: string) => Promise<any>;
};

const idsDosEstados = async (projectId: string, grupo?: string) =>
  (
    await prisma.state.findMany({
      where: { projectId, deletedAt: null, ...(grupo ? { group: grupo } : {}) },
      select: { id: true },
      orderBy: { sequence: "asc" },
    })
  ).map((s) => s.id);

const AGRUPAMENTOS: Record<string, TAgrupamento> = {
  state_id: {
    valores: (projectId) => idsDosEstados(projectId),
    recorte: async (where, valor) => ({ ...where, stateId: restringirAoGrupo(where.stateId, valor) }),
  },
  priority: {
    valores: async () => ["urgent", "high", "medium", "low", "none"],
    recorte: async (where, valor) => ({ ...where, priority: restringirAoGrupo(where.priority, valor) }),
  },
  state__group: {
    valores: async () => [...STATE_GROUPS, "triage"],
    recorte: async (where, valor, projectId) => ({
      ...where,
      stateId: restringirAoGrupo(where.stateId, await idsDosEstados(projectId, valor as string)),
    }),
  },
  created_by: {
    valores: async (projectId) =>
      (
        await prisma.issue.findMany({
          where: { projectId, deletedAt: null },
          select: { createdById: true },
          distinct: ["createdById"],
        })
      ).map((i) => i.createdById),
    recorte: async (where, valor) => ({ ...where, createdById: restringirAoGrupo(where.createdById, valor) }),
  },
};

async function listarChamadosDoCiclo({ params, user, query }: any) {
  const { slug, project_id, cycle_id } = params;
  const ws = await getWorkspaceOrFail(slug);
  await getProjectOrFail(ws.id, project_id, user.id);

  // Mesmo recorte da listagem de chamados do projeto: arquivado e rascunho têm
  // telas próprias e não entram no quadro do ciclo.
  const where: any = {
    projectId: project_id,
    deletedAt: null,
    isDraft: false,
    archivedAt: null,
    cycleIssues: { some: { cycleId: cycle_id, deletedAt: null } },
  };
  await applyIssueFilters(where, normalizeFilters(query as Record<string, unknown>), { projectId: project_id });

  const orderBy = resolverOrdenacao(query.order_by, { createdAt: "desc" });
  const perPage = Number(query.per_page ?? 30);
  const agrupamento = AGRUPAMENTOS[query.group_by as string];

  if (!agrupamento) {
    return paginate({
      query: (skip, take) => prisma.issue.findMany({ where, skip, take, include: ISSUE_INCLUDE, orderBy }),
      count: () => prisma.issue.count({ where }),
      cursor: query.cursor as string | undefined,
      perPage,
      transform: (itens) => itens.map((i) => ({ ...serializeIssue(i), cycle_id })),
    });
  }

  const total_count = await prisma.issue.count({ where });
  const results: Record<string, unknown> = {};

  for (const valor of await agrupamento.valores(project_id)) {
    const recorte = await agrupamento.recorte(where, valor, project_id);
    const [chamados, quantidade] = await Promise.all([
      prisma.issue.findMany({ where: recorte, include: ISSUE_INCLUDE, orderBy, take: perPage }),
      prisma.issue.count({ where: recorte }),
    ]);
    results[valor ?? "none"] = {
      results: chamados.map((i) => ({ ...serializeIssue(i), cycle_id })),
      total_results: quantidade,
      next_cursor: `${perPage}:1:0`,
      prev_cursor: `${perPage}:0:1`,
      next_page_results: quantidade > perPage,
      prev_page_results: false,
    };
  }

  return {
    total_count,
    results,
    next_cursor: null,
    prev_cursor: null,
    next_page_results: false,
    prev_page_results: false,
  };
}

async function adicionarChamadosAoCiclo({ params, body, user, set }: any) {
  const { slug, project_id, cycle_id } = params;
  const ws = await getWorkspaceOrFail(slug);
  await getProjectOrFail(ws.id, project_id, user.id);
  await requireProjectAction(ws.id, project_id, user.id, EProjectAction.CYCLE_MANAGE);

  const issueIds: string[] = (body as any)?.issues ?? [];
  if (!issueIds.length) {
    set.status = 400;
    return { detail: "Informe ao menos um chamado." };
  }

  const vinculos = await prisma.cycleIssue.findMany({
    where: { issueId: { in: issueIds }, projectId: project_id, deletedAt: null },
    select: { id: true, issueId: true, cycleId: true },
  });

  // Um chamado pertence a um ciclo só — o frontend guarda `cycle_id` singular.
  // Vínculos com outros ciclos saem quando o chamado é movido para este.
  const deOutrosCiclos = vinculos.filter((v) => v.cycleId !== cycle_id);
  const jaNoCiclo = new Set(vinculos.filter((v) => v.cycleId === cycle_id).map((v) => v.issueId));
  const aCriar = issueIds.filter((id) => !jaNoCiclo.has(id));

  await prisma.$transaction(async (tx) => {
    if (deOutrosCiclos.length) {
      await tx.cycleIssue.updateMany({
        where: { id: { in: deOutrosCiclos.map((v) => v.id) } },
        data: { deletedAt: new Date() },
      });
    }
    await tx.cycleIssue.createMany({
      data: aCriar.map((issueId) => ({ cycleId: cycle_id, issueId, workspaceId: ws.id, projectId: project_id })),
    });
  });

  set.status = 201;
  return { message: `${aCriar.length} chamados adicionados.` };
}

async function removerChamadoDoCiclo({ params, user, set }: any) {
  const { slug, project_id, cycle_id, issue_id } = params;
  const ws = await getWorkspaceOrFail(slug);
  await getProjectOrFail(ws.id, project_id, user.id);
  await requireProjectAction(ws.id, project_id, user.id, EProjectAction.CYCLE_MANAGE);
  await prisma.cycleIssue.updateMany({
    where: { cycleId: cycle_id, issueId: issue_id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  set.status = 204;
  return null;
}

// ── Progresso (handler compartilhado) ─────────────────────────────────────────
//
// `progress/` e `cycle-progress/` devolvem o mesmo `TProgressSnapshot`: o
// frontend tipa as duas chamadas igual (workspaceActiveCyclesProgress e
// ...ProgressPro), só muda o caminho que a versão do produto escolhe.

async function progressoDoCiclo({ params, user, set }: any) {
  const { slug, project_id, cycle_id } = params;
  const ws = await getWorkspaceOrFail(slug);
  await getProjectOrFail(ws.id, project_id, user.id);

  const cycle = await prisma.cycle.findFirst({
    where: { id: cycle_id, projectId: project_id, deletedAt: null },
    select: { id: true },
  });
  if (!cycle) {
    set.status = 404;
    return { detail: "Ciclo não encontrado." };
  }

  return instantaneoDeProgresso((await resumirCiclos([cycle_id])).get(cycle_id) ?? resumoZerado());
}

export const cycleModule = new Elysia({ prefix: "/workspaces/:slug/projects/:project_id" })
  .use(authPlugin)

  // ── Checagem de datas (antes das rotas dinâmicas de ciclo) ──────────────────

  .post("/cycles/date-check/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.CYCLE_MANAGE);

    const b = body as any;
    if (!b.start_date || !b.end_date) {
      set.status = 400;
      return { detail: "As datas de início e término são obrigatórias." };
    }

    const inicio = new Date(b.start_date);
    const fim = new Date(b.end_date);

    // Dois intervalos se sobrepõem quando cada um começa antes do fim do outro.
    // Uma condição só cobre os três casos (encavalado à esquerda, à direita e
    // contido) que o legado escrevia separados.
    const sobreposto = await prisma.cycle.findFirst({
      where: {
        projectId: project_id,
        deletedAt: null,
        startDate: { lte: fim },
        endDate: { gte: inicio },
        ...(b.cycle_id ? { id: { not: b.cycle_id } } : {}),
      },
      select: { id: true, name: true },
    });

    if (!sobreposto) return { status: true };
    return { status: false, error: `Já existe um ciclo ("${sobreposto.name}") neste intervalo de datas.` };
  })

  // ── Favoritos de ciclo ──────────────────────────────────────────────────────
  //
  // O frontend chama `user-favorite-cycles/` (CycleService.addCycleToFavorites /
  // removeCycleFromFavorites). É a mesma tabela do `/favorites/` do workspace,
  // com o tipo fixo em "cycle".

  .get("/user-favorite-cycles/", async ({ params: { slug, project_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);

    const cycles = await prisma.cycle.findMany({ where: { projectId: project_id, deletedAt: null } });
    const porId = new Map(cycles.map((c) => [c.id, c]));

    const favoritos = await prisma.userFavorite.findMany({
      where: {
        workspaceId: ws.id,
        userId: user.id,
        entityType: "cycle",
        entityId: { in: [...porId.keys()] },
        deletedAt: null,
      },
      orderBy: { sequence: "asc" },
    });

    const resumos = await resumirCiclos(favoritos.map((f) => f.entityId));
    return favoritos.map((favorito) => ({
      id: favorito.id,
      user: user.id,
      cycle: favorito.entityId,
      cycle_detail: serializeCycle(porId.get(favorito.entityId), resumos.get(favorito.entityId), true),
      created_at: isoDate(favorito.createdAt),
      updated_at: isoDate(favorito.updatedAt),
    }));
  })

  .post("/user-favorite-cycles/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);

    const cycleId = (body as any)?.cycle;
    const cycle = cycleId
      ? await prisma.cycle.findFirst({ where: { id: cycleId, projectId: project_id, deletedAt: null } })
      : null;
    if (!cycle) {
      set.status = 400;
      return { detail: "Ciclo não encontrado." };
    }

    // Favoritar duas vezes não pode criar duas linhas: a estrela é um booleano.
    const existente = await prisma.userFavorite.findFirst({
      where: { workspaceId: ws.id, userId: user.id, entityType: "cycle", entityId: cycle.id, deletedAt: null },
    });
    const favorito =
      existente ??
      (await prisma.userFavorite.create({
        data: {
          workspaceId: ws.id,
          userId: user.id,
          entityType: "cycle",
          entityId: cycle.id,
          name: cycle.name,
        },
      }));

    set.status = 201;
    return { id: favorito.id, user: user.id, cycle: cycle.id, entity_type: "cycle", entity_identifier: cycle.id };
  })

  .delete("/user-favorite-cycles/:cycle_id/", async ({ params: { slug, project_id, cycle_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    // Idempotente: desfavoritar o que já não é favorito não é erro para a tela.
    await prisma.userFavorite.updateMany({
      where: { workspaceId: ws.id, userId: user.id, entityType: "cycle", entityId: cycle_id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    set.status = 204;
    return null;
  })

  // ── Ciclos arquivados ───────────────────────────────────────────────────────

  .get("/archived-cycles/", async ({ params: { slug, project_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);

    const cycles = await prisma.cycle.findMany({
      where: { projectId: project_id, deletedAt: null, archivedAt: { not: null } },
      orderBy: { archivedAt: "desc" },
    });
    return serializarCiclos(cycles, ws.id, user.id);
  })

  .get("/archived-cycles/:cycle_id/", async ({ params: { slug, project_id, cycle_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);

    const cycle = await prisma.cycle.findFirst({
      where: { id: cycle_id, projectId: project_id, deletedAt: null, archivedAt: { not: null } },
    });
    if (!cycle) {
      set.status = 404;
      return { detail: "Ciclo arquivado não encontrado." };
    }
    return serializarCiclo(cycle, ws.id, user.id);
  })

  // ── CRUD ────────────────────────────────────────────────────────────────────

  .get("/cycles/", async ({ params: { slug, project_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    // Arquivados saem da listagem principal e só aparecem em /archived-cycles/.
    const where: any = { projectId: project_id, deletedAt: null, archivedAt: null };

    // `cycle_view=current` é o que a aba do ciclo ativo pede (getCyclesWithParams
    // com "current"): devolve só o ciclo em andamento.
    if (query.cycle_view === "current") {
      const agora = new Date();
      where.startDate = { lte: agora };
      where.endDate = { gte: agora };
    }

    const cycles = await prisma.cycle.findMany({ where, orderBy: { createdAt: "desc" } });
    // Array puro, sem envelope: o store do frontend faz `response.forEach(...)`
    // direto em cima do corpo (cycle.store.ts, fetchAllCycles/fetchActiveCycle).
    return serializarCiclos(cycles, ws.id, user.id);
  })

  .post("/cycles/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.CYCLE_MANAGE);

    const b = body as any;
    if (!b.name) {
      set.status = 400;
      return { detail: "O nome é obrigatório." };
    }

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
    return serializarCiclo(cycle, ws.id, user.id);
  })

  .get("/cycles/:cycle_id/", async ({ params: { slug, project_id, cycle_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const cycle = await prisma.cycle.findFirst({
      where: { id: cycle_id, projectId: project_id, deletedAt: null },
    });
    if (!cycle) {
      set.status = 404;
      return { detail: "Ciclo não encontrado." };
    }
    return serializarCiclo(cycle, ws.id, user.id);
  })

  .patch("/cycles/:cycle_id/", async ({ params: { slug, project_id, cycle_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.CYCLE_MANAGE);

    const cycle = await prisma.cycle.findFirst({
      where: { id: cycle_id, projectId: project_id, deletedAt: null },
      select: { id: true },
    });
    if (!cycle) {
      set.status = 404;
      return { detail: "Ciclo não encontrado." };
    }

    const b = body as any;
    const data: any = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.description !== undefined) data.description = b.description;
    if (b.start_date !== undefined) data.startDate = b.start_date ? new Date(b.start_date) : null;
    if (b.end_date !== undefined) data.endDate = b.end_date ? new Date(b.end_date) : null;
    if (b.status !== undefined) data.status = b.status;

    const atualizado = await prisma.cycle.update({ where: { id: cycle_id }, data });
    return serializarCiclo(atualizado, ws.id, user.id);
  })

  .delete("/cycles/:cycle_id/", async ({ params: { slug, project_id, cycle_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.CYCLE_MANAGE);
    await prisma.cycle.update({ where: { id: cycle_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // ── Arquivar / desarquivar ──────────────────────────────────────────────────

  .post("/cycles/:cycle_id/archive/", async ({ params: { slug, project_id, cycle_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.CYCLE_MANAGE);

    const cycle = await prisma.cycle.findFirst({
      where: { id: cycle_id, projectId: project_id, deletedAt: null },
    });
    if (!cycle) {
      set.status = 404;
      return { detail: "Ciclo não encontrado." };
    }

    const arquivado = await prisma.cycle.update({ where: { id: cycle_id }, data: { archivedAt: new Date() } });
    return serializarCiclo(arquivado, ws.id, user.id);
  })

  .delete("/cycles/:cycle_id/archive/", async ({ params: { slug, project_id, cycle_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.CYCLE_MANAGE);

    const cycle = await prisma.cycle.findFirst({
      where: { id: cycle_id, projectId: project_id, deletedAt: null },
    });
    if (!cycle) {
      set.status = 404;
      return { detail: "Ciclo não encontrado." };
    }

    const restaurado = await prisma.cycle.update({ where: { id: cycle_id }, data: { archivedAt: null } });
    return serializarCiclo(restaurado, ws.id, user.id);
  })

  // ── Progresso ───────────────────────────────────────────────────────────────

  .get("/cycles/:cycle_id/progress/", (ctx) => progressoDoCiclo(ctx))
  .get("/cycles/:cycle_id/cycle-progress/", (ctx) => progressoDoCiclo(ctx))

  // ── Analytics (distribuição por responsável, etiqueta e etapa) ──────────────

  .get("/cycles/:cycle_id/analytics/", async ({ params: { slug, project_id, cycle_id }, user, query, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);

    const cycle = await prisma.cycle.findFirst({
      where: { id: cycle_id, projectId: project_id, deletedAt: null },
      select: { id: true, startDate: true, endDate: true },
    });
    if (!cycle) {
      set.status = 404;
      return { detail: "Ciclo não encontrado." };
    }

    // `type=points` pesa cada chamado pelo ponto de estimativa; qualquer outro
    // valor conta um por chamado. O frontend guarda a resposta em
    // `estimate_distribution` ou `distribution` conforme o parâmetro.
    const tipo: TTipoAnalise = query.type === "points" ? "points" : "issues";

    const vinculos = await prisma.cycleIssue.findMany({
      where: vinculosVivosWhere([cycle_id]),
      select: {
        issue: {
          select: {
            completedAt: true,
            estimatePoint: { select: { value: true } },
            state: { select: { id: true, name: true, color: true, group: true } },
            assignees: {
              where: { deletedAt: null },
              select: {
                assignee: {
                  select: {
                    id: true, displayName: true, firstName: true, lastName: true, avatar: true, avatarUrl: true,
                  },
                },
              },
            },
            labels: {
              where: { deletedAt: null },
              select: { label: { select: { id: true, name: true, color: true } } },
            },
          },
        },
      },
    });

    const responsaveis = criarDistribuicao<{
      assignee_id: string | null;
      avatar_url: string | null;
      first_name: string | null;
      last_name: string | null;
      display_name: string | null;
    }>(tipo);
    const etiquetas = criarDistribuicao<{
      label_id: string | null;
      label_name: string | null;
      color: string | null;
    }>(tipo);
    const etapas = criarDistribuicao<{
      state_id: string | null;
      state_name: string | null;
      color: string | null;
      group: TStateGroup;
    }>(tipo);

    const conclusoes: TConclusao[] = [];
    let totalGeral = 0;

    for (const { issue } of vinculos) {
      const grupo = normalizarGrupo(issue.state?.group);
      const concluido = grupo === "completed";
      const peso = tipo === "points" ? valorDoPonto(issue.estimatePoint?.value) : 1;
      totalGeral += peso;
      if (concluido && issue.completedAt) conclusoes.push({ data: issue.completedAt, peso });

      etapas.adicionar(
        issue.state?.id ?? "sem-etapa",
        {
          state_id: issue.state?.id ?? null,
          state_name: issue.state?.name ?? null,
          color: issue.state?.color ?? null,
          group: grupo,
        },
        concluido,
        peso,
      );

      // Um chamado com dois responsáveis conta em ambos: a distribuição é por
      // pessoa, não uma partição dos chamados.
      for (const pessoa of ouNenhum(issue.assignees.map((a) => a.assignee))) {
        responsaveis.adicionar(
          pessoa?.id ?? "sem-responsavel",
          {
            assignee_id: pessoa?.id ?? null,
            avatar_url: pessoa?.avatarUrl ?? pessoa?.avatar ?? null,
            first_name: pessoa?.firstName ?? null,
            last_name: pessoa?.lastName ?? null,
            display_name: pessoa?.displayName ?? null,
          },
          concluido,
          peso,
        );
      }

      for (const etiqueta of ouNenhum(issue.labels.map((l) => l.label))) {
        etiquetas.adicionar(
          etiqueta?.id ?? "sem-etiqueta",
          {
            label_id: etiqueta?.id ?? null,
            label_name: etiqueta?.name ?? null,
            color: etiqueta?.color ?? null,
          },
          concluido,
          peso,
        );
      }
    }

    return {
      assignees: responsaveis.valores(),
      labels: etiquetas.valores(),
      states: etapas.valores(),
      completion_chart: montarGraficoConclusao(cycle.startDate, cycle.endDate, conclusoes, totalGeral),
    };
  })

  // ── Preferências de exibição por usuário ────────────────────────────────────

  .get("/cycles/:cycle_id/user-properties/", async ({ params: { slug, project_id, cycle_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const props = await prisma.cycleUserProperties.findUnique({
      where: { cycleId_userId: { cycleId: cycle_id, userId: user.id } },
    });
    return serializeUserProperties(props, cycle_id, user.id);
  })

  .patch("/cycles/:cycle_id/user-properties/", async ({ params: { slug, project_id, cycle_id }, body, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const b = body as any;
    const props = await prisma.cycleUserProperties.upsert({
      where: { cycleId_userId: { cycleId: cycle_id, userId: user.id } },
      create: {
        cycleId: cycle_id,
        userId: user.id,
        workspaceId: ws.id,
        projectId: project_id,
        filters: b.filters ?? {},
        displayFilters: b.display_filters ?? {},
        displayProperties: b.display_properties ?? {},
        richFilters: b.rich_filters ?? {},
      },
      update: {
        ...(b.filters !== undefined && { filters: b.filters }),
        ...(b.display_filters !== undefined && { displayFilters: b.display_filters }),
        ...(b.display_properties !== undefined && { displayProperties: b.display_properties }),
        ...(b.rich_filters !== undefined && { richFilters: b.rich_filters }),
      },
    });
    return serializeUserProperties(props, cycle_id, user.id);
  })

  // ── Transferência de chamados entre ciclos ──────────────────────────────────

  .post("/cycles/:cycle_id/transfer-issues/", async ({ params: { slug, project_id, cycle_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.CYCLE_MANAGE);

    const novoCicloId = (body as any)?.new_cycle_id;
    if (!novoCicloId) { set.status = 400; return { detail: "O ciclo de destino é obrigatório." }; }
    if (novoCicloId === cycle_id) { set.status = 400; return { detail: "O ciclo de destino deve ser diferente da origem." }; }

    const destino = await prisma.cycle.findFirst({
      where: { id: novoCicloId, projectId: project_id, deletedAt: null, archivedAt: null },
      select: { id: true, endDate: true },
    });
    if (!destino) { set.status = 400; return { detail: "Ciclo de destino não encontrado." }; }

    // O legado recusa transferir para um ciclo já encerrado: os chamados
    // sumiriam do quadro ativo sem ninguém trabalhar neles.
    if (destino.endDate && destino.endDate < new Date()) {
      set.status = 400;
      return { detail: "O ciclo de destino já foi encerrado." };
    }

    const vinculos = await prisma.cycleIssue.findMany({
      where: vinculosVivosWhere([cycle_id]),
      select: { id: true, issueId: true, issue: { select: { state: { select: { group: true } } } } },
    });

    const GRUPOS_ENCERRADOS: TStateGroup[] = ["completed", "cancelled"];
    const pendentes = vinculos.filter((v) => !GRUPOS_ENCERRADOS.includes(normalizarGrupo(v.issue.state?.group)));

    if (!pendentes.length) return { message: "Nenhum chamado pendente para transferir." };

    const jaNoDestino = await prisma.cycleIssue.findMany({
      where: { cycleId: novoCicloId, issueId: { in: pendentes.map((v) => v.issueId) }, deletedAt: null },
      select: { issueId: true },
    });
    const existentes = new Set(jaNoDestino.map((v) => v.issueId));
    const aCriar = pendentes.filter((v) => !existentes.has(v.issueId));

    // Uma transação só: se a criação no destino falhar, o vínculo antigo não
    // pode ficar apagado — os chamados sumiriam dos dois ciclos.
    await prisma.$transaction(async (tx) => {
      await tx.cycleIssue.updateMany({
        where: { id: { in: pendentes.map((v) => v.id) } },
        data: { deletedAt: new Date() },
      });
      await tx.cycleIssue.createMany({
        data: aCriar.map((v) => ({
          cycleId: novoCicloId,
          issueId: v.issueId,
          workspaceId: ws.id,
          projectId: project_id,
        })),
      });
    });

    return { message: `${pendentes.length} chamados transferidos.` };
  })

  // ── Chamados do ciclo ───────────────────────────────────────────────────────
  //
  // `issues/` é o caminho histórico da API TS; `cycle-issues/` é o que o
  // frontend chama (CycleService.getCycleIssues, IssueService.addIssueToCycle,
  // removeIssueFromCycle). Mesmos handlers nos dois.

  .get("/cycles/:cycle_id/issues/", (ctx) => listarChamadosDoCiclo(ctx))
  .get("/cycles/:cycle_id/cycle-issues/", (ctx) => listarChamadosDoCiclo(ctx))

  .post("/cycles/:cycle_id/issues/", (ctx) => adicionarChamadosAoCiclo(ctx))
  .post("/cycles/:cycle_id/cycle-issues/", (ctx) => adicionarChamadosAoCiclo(ctx))

  .delete("/cycles/:cycle_id/issues/:issue_id/", (ctx) => removerChamadoDoCiclo(ctx))
  .delete("/cycles/:cycle_id/cycle-issues/:issue_id/", (ctx) => removerChamadoDoCiclo(ctx));
