import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";
import { getWorkspaceOrFail, getProjectOrFail } from "@utils/workspace";
import { EProjectAction, requireProjectAction } from "@utils/permission-checks";
import { dateOnly, isoDate } from "@utils/serialize";

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
 * Conta os chamados de vários ciclos de uma vez. Recebe uma lista para que a
 * listagem de arquivados não caia em N+1 (uma consulta por ciclo).
 */
async function contarPorEtapa(cycleIds: string[]): Promise<Map<string, TContagemPorEtapa>> {
  const mapa = new Map<string, TContagemPorEtapa>(cycleIds.map((id) => [id, contadoresZerados()]));
  if (!cycleIds.length) return mapa;

  const vinculos = await prisma.cycleIssue.findMany({
    where: vinculosVivosWhere(cycleIds),
    select: { cycleId: true, issue: { select: { state: { select: { group: true } } } } },
  });

  for (const vinculo of vinculos) {
    const contagem = mapa.get(vinculo.cycleId);
    if (!contagem) continue;
    contagem.total++;
    contagem[normalizarGrupo(vinculo.issue.state?.group)]++;
  }
  return mapa;
}

type TBaldeDistribuicao = { total_issues: number; pending_issues: number; completed_issues: number };

/**
 * Acumulador de distribuição. Responsável, etiqueta e etapa contam exatamente a
 * mesma coisa mudando só a chave e os metadados — a fábrica evita três laços
 * praticamente idênticos.
 */
function criarDistribuicao<TMeta extends object>() {
  const baldes = new Map<string, TMeta & TBaldeDistribuicao>();
  return {
    adicionar(chave: string, meta: TMeta, concluido: boolean) {
      const balde = baldes.get(chave) ?? { ...meta, total_issues: 0, pending_issues: 0, completed_issues: 0 };
      balde.total_issues++;
      balde[concluido ? "completed_issues" : "pending_issues"]++;
      baldes.set(chave, balde);
    },
    valores: () => [...baldes.values()],
  };
}

/** Lista com um item nulo quando vazia — é o balde "Nenhum" da distribuição. */
const ouNenhum = <T>(itens: T[]): (T | null)[] => (itens.length ? itens : [null]);

const DIA_MS = 24 * 60 * 60 * 1000;

/** Chave diária do gráfico ("2026-08-10"), sempre em UTC. */
const diaChave = (data: Date): string => data.toISOString().split("T")[0]!;

/**
 * Burndown: para cada dia do ciclo, quantos chamados ainda estavam pendentes.
 * Dias futuros ficam `null` para o gráfico parar a linha em hoje.
 *
 * Ciclo sem datas devolve gráfico vazio em vez de erro (o legado respondia 400):
 * ciclos em rascunho não têm datas e a tela de analytics não pode quebrar.
 */
function montarGraficoConclusao(
  inicio: Date | null,
  fim: Date | null,
  conclusoes: Date[],
  total: number,
): Record<string, number | null> {
  if (!inicio || !fim) return {};

  // Ordenado para varrer com um ponteiro só; inclui conclusões anteriores ao
  // início do ciclo, que já entram descontadas no primeiro dia.
  const diasConcluidos = conclusoes.map(diaChave).sort();
  const hoje = diaChave(new Date());
  const grafico: Record<string, number | null> = {};

  let ponteiro = 0;
  let acumulado = 0;
  for (let instante = inicio.getTime(); instante <= fim.getTime(); instante += DIA_MS) {
    const chave = diaChave(new Date(instante));
    while (ponteiro < diasConcluidos.length && diasConcluidos[ponteiro]! <= chave) {
      acumulado++;
      ponteiro++;
    }
    grafico[chave] = chave > hoje ? null : total - acumulado;
  }
  return grafico;
}

/**
 * Converte o ciclo do Prisma (camelCase) para o contrato `ICycle` do frontend
 * (snake_case). As rotas antigas deste arquivo ainda devolvem o objeto cru;
 * as rotas novas passam por aqui.
 */
function serializeCycle(cycle: any, contagem?: TContagemPorEtapa): Record<string, unknown> {
  const c = contagem ?? contadoresZerados();
  return {
    id: cycle.id,
    name: cycle.name,
    description: cycle.description ?? "",

    start_date: dateOnly(cycle.startDate),
    end_date: dateOnly(cycle.endDate),
    status: cycle.status ?? "draft",
    archived_at: isoDate(cycle.archivedAt),

    owned_by_id: cycle.ownedById,
    project_id: cycle.projectId,
    workspace_id: cycle.workspaceId,
    project_detail: { id: cycle.projectId },

    created_at: isoDate(cycle.createdAt),
    updated_at: isoDate(cycle.updatedAt),
    created_by: cycle.createdById ?? null,

    is_favorite: false,
    sort_order: 65535,
    view_props: { filters: {} },
    progress: [],
    version: 1,

    total_issues: c.total,
    backlog_issues: c.backlog,
    unstarted_issues: c.unstarted,
    started_issues: c.started,
    completed_issues: c.completed,
    cancelled_issues: c.cancelled,

    // Pontos de estimativa não existem no schema Typescript (Issue não tem
    // estimate_point); zerados para não quebrar o tipo TProgressSnapshot.
    total_estimate_points: 0,
    backlog_estimate_points: 0,
    unstarted_estimate_points: 0,
    started_estimate_points: 0,
    completed_estimate_points: 0,
    cancelled_estimate_points: 0,
  };
}

const serializeUserProperties = (props: any, cycleId: string, userId: string) => ({
  id: props?.id ?? null,
  cycle: cycleId,
  user: userId,
  filters: props?.filters ?? {},
  display_filters: props?.displayFilters ?? {},
  display_properties: props?.displayProperties ?? {},
});

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

  // ── Ciclos arquivados ───────────────────────────────────────────────────────

  .get("/archived-cycles/", async ({ params: { slug, project_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);

    const cycles = await prisma.cycle.findMany({
      where: { projectId: project_id, deletedAt: null, archivedAt: { not: null } },
      orderBy: { archivedAt: "desc" },
    });

    const contagens = await contarPorEtapa(cycles.map((c) => c.id));
    return cycles.map((c) => serializeCycle(c, contagens.get(c.id)));
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
    return serializeCycle(cycle, (await contarPorEtapa([cycle_id])).get(cycle_id));
  })

  // ── CRUD ────────────────────────────────────────────────────────────────────

  .get("/cycles/", async ({ params: { slug, project_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    // Arquivados saem da listagem principal e só aparecem em /archived-cycles/.
    const where = { projectId: project_id, deletedAt: null, archivedAt: null };
    return paginate({
      query: (skip, take) => prisma.cycle.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      count: () => prisma.cycle.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/cycles/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.CYCLE_MANAGE);

    const b = body as any;
    if (!b.name) { set.status = 400; return { detail: "O nome é obrigatório." }; }

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
    return cycle;
  })

  .get("/cycles/:cycle_id/", async ({ params: { slug, project_id, cycle_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    return prisma.cycle.findFirstOrThrow({ where: { id: cycle_id, projectId: project_id, deletedAt: null } });
  })

  .patch("/cycles/:cycle_id/", async ({ params: { slug, project_id, cycle_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.CYCLE_MANAGE);

    const b = body as any;
    const data: any = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.description !== undefined) data.description = b.description;
    if (b.start_date !== undefined) data.startDate = b.start_date ? new Date(b.start_date) : null;
    if (b.end_date !== undefined) data.endDate = b.end_date ? new Date(b.end_date) : null;
    if (b.status !== undefined) data.status = b.status;

    return prisma.cycle.update({ where: { id: cycle_id }, data });
  })

  .delete("/cycles/:cycle_id/", async ({ params: { slug, project_id, cycle_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
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
    if (!cycle) { set.status = 404; return { detail: "Ciclo não encontrado." }; }

    const arquivado = await prisma.cycle.update({ where: { id: cycle_id }, data: { archivedAt: new Date() } });
    return serializeCycle(arquivado, (await contarPorEtapa([cycle_id])).get(cycle_id));
  })

  .delete("/cycles/:cycle_id/archive/", async ({ params: { slug, project_id, cycle_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.CYCLE_MANAGE);

    const cycle = await prisma.cycle.findFirst({
      where: { id: cycle_id, projectId: project_id, deletedAt: null },
    });
    if (!cycle) { set.status = 404; return { detail: "Ciclo não encontrado." }; }

    const restaurado = await prisma.cycle.update({ where: { id: cycle_id }, data: { archivedAt: null } });
    return serializeCycle(restaurado, (await contarPorEtapa([cycle_id])).get(cycle_id));
  })

  // ── Progresso ───────────────────────────────────────────────────────────────

  .get("/cycles/:cycle_id/progress/", async ({ params: { slug, project_id, cycle_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);

    const cycle = await prisma.cycle.findFirst({
      where: { id: cycle_id, projectId: project_id, deletedAt: null },
      select: { id: true },
    });
    if (!cycle) { set.status = 404; return { detail: "Ciclo não encontrado." }; }

    const c = (await contarPorEtapa([cycle_id])).get(cycle_id) ?? contadoresZerados();
    return {
      total_issues: c.total,
      backlog_issues: c.backlog,
      unstarted_issues: c.unstarted,
      started_issues: c.started,
      completed_issues: c.completed,
      cancelled_issues: c.cancelled,

      // Sem pontos de estimativa no schema Typescript — ver serializeCycle.
      total_estimate_points: 0,
      backlog_estimate_points: 0,
      unstarted_estimate_points: 0,
      started_estimate_points: 0,
      completed_estimate_points: 0,
      cancelled_estimate_points: 0,
    };
  })

  // ── Analytics (distribuição por responsável, etiqueta e etapa) ──────────────

  .get("/cycles/:cycle_id/analytics/", async ({ params: { slug, project_id, cycle_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);

    const cycle = await prisma.cycle.findFirst({
      where: { id: cycle_id, projectId: project_id, deletedAt: null },
      select: { id: true, startDate: true, endDate: true },
    });
    if (!cycle) { set.status = 404; return { detail: "Ciclo não encontrado." }; }

    const vinculos = await prisma.cycleIssue.findMany({
      where: vinculosVivosWhere([cycle_id]),
      select: {
        issue: {
          select: {
            completedAt: true,
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
    }>();
    const etiquetas = criarDistribuicao<{
      label_id: string | null;
      label_name: string | null;
      color: string | null;
    }>();
    const etapas = criarDistribuicao<{
      state_id: string | null;
      state_name: string | null;
      color: string | null;
      group: TStateGroup;
    }>();

    const conclusoes: Date[] = [];

    for (const { issue } of vinculos) {
      const grupo = normalizarGrupo(issue.state?.group);
      const concluido = grupo === "completed";
      if (concluido && issue.completedAt) conclusoes.push(issue.completedAt);

      etapas.adicionar(
        issue.state?.id ?? "sem-etapa",
        {
          state_id: issue.state?.id ?? null,
          state_name: issue.state?.name ?? null,
          color: issue.state?.color ?? null,
          group: grupo,
        },
        concluido,
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
        );
      }
    }

    // O parâmetro `type=points` do legado não muda nada aqui: o schema
    // Typescript não guarda pontos de estimativa, então só há contagem por
    // chamado.
    return {
      assignees: responsaveis.valores(),
      labels: etiquetas.valores(),
      states: etapas.valores(),
      completion_chart: montarGraficoConclusao(cycle.startDate, cycle.endDate, conclusoes, vinculos.length),
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
      },
      update: {
        ...(b.filters !== undefined && { filters: b.filters }),
        ...(b.display_filters !== undefined && { displayFilters: b.display_filters }),
        ...(b.display_properties !== undefined && { displayProperties: b.display_properties }),
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

  .get("/cycles/:cycle_id/issues/", async ({ params: { slug, project_id, cycle_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where = { cycleId: cycle_id, deletedAt: null };
    return paginate({
      query: (skip, take) =>
        prisma.cycleIssue.findMany({ where, skip, take, include: { issue: true }, orderBy: { createdAt: "asc" } }),
      count: () => prisma.cycleIssue.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/cycles/:cycle_id/issues/", async ({ params: { slug, project_id, cycle_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.CYCLE_MANAGE);

    const issueIds: string[] = (body as any).issues ?? [];
    const existing = await prisma.cycleIssue.findMany({
      where: { cycleId: cycle_id, issueId: { in: issueIds }, deletedAt: null },
      select: { issueId: true },
    });
    const existingSet = new Set(existing.map((e) => e.issueId));
    const toCreate = issueIds.filter((id) => !existingSet.has(id));

    await prisma.cycleIssue.createMany({
      data: toCreate.map((issueId) => ({ cycleId: cycle_id, issueId, workspaceId: ws.id, projectId: project_id })),
    });

    set.status = 201;
    return { message: `${toCreate.length} chamados adicionados.` };
  })

  .delete("/cycles/:cycle_id/issues/:issue_id/", async ({ params: { slug, project_id, cycle_id, issue_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.CYCLE_MANAGE);
    await prisma.cycleIssue.updateMany({ where: { cycleId: cycle_id, issueId: issue_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  });
