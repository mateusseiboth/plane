/**
 * Contrato das rotas de ciclo.
 *
 * O frontend tipa a resposta como `ICycle` (packages/types/src/cycle/cycle.ts):
 * snake_case, listagem em array puro (cycle.store.ts faz `response.forEach`) e
 * os `*_estimate_points` somando o valor numérico do ponto de estimativa.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import { prismaReal } from "@tests/helpers/prisma-real";
import {
  createUser,
  createApiToken,
  createWorkspace,
  createProject,
  createCycle,
  createIssue,
  createState,
  apiClient,
} from "@tests/helpers/factory";

const prisma = new Proxy({} as any, { get: (_, chave) => (prismaReal() as any)[chave] });

const DIA_MS = 24 * 60 * 60 * 1000;

describe("TestCycleListCreateAPIEndpoint", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let projectId: string;
  let userId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    userId = user.id;
    const token = await createApiToken(userId);
    const ws = await createWorkspace(userId);
    wsSlug = ws.slug;
    const project = await createProject(ws.id, userId, { cycleView: true });
    projectId = project.id;
    client = apiClient(token.token);
  });

  afterAll(async () => {
    await cleanDb();
  });

  function cyclesUrl() {
    return `/workspaces/${wsSlug}/projects/${projectId}/cycles/`;
  }

  it("create cycle success should return 201", async () => {
    const res = await client.post(cyclesUrl(), {
      name: "Test Cycle",
      description: "A test cycle for unit tests",
    });

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.id).toBeDefined();
    expect(data.name).toBe("Test Cycle");
    expect(data.description).toBe("A test cycle for unit tests");
  });

  it("create cycle with empty data should return 400", async () => {
    const res = await client.post(cyclesUrl(), {});
    expect(res.status).toBe(400);
  });

  it("create cycle with missing name should return 400", async () => {
    const res = await client.post(cyclesUrl(), { description: "Test cycle" });
    expect(res.status).toBe(400);
  });

  // A listagem devolve ARRAY, não envelope paginado — ver list-endpoints.test.ts.
  it("list cycles should return an array", async () => {
    const res = await client.get(cyclesUrl());
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data).toBeInstanceOf(Array);
    expect(data.length).toBeGreaterThan(0);
  });

  it("get cycle detail should return cycle", async () => {
    const createRes = await client.post(cyclesUrl(), { name: "Detail Cycle" });
    const created = await createRes.json() as any;

    const res = await client.get(`${cyclesUrl()}${created.id}/`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.id).toBe(created.id);
    expect(data.name).toBe("Detail Cycle");
  });

  it("update cycle should return updated data", async () => {
    const createRes = await client.post(cyclesUrl(), { name: "Old Name" });
    const created = await createRes.json() as any;

    const res = await client.patch(`${cyclesUrl()}${created.id}/`, { name: "New Name" });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.name).toBe("New Name");
  });

  it("delete cycle should return 204", async () => {
    const createRes = await client.post(cyclesUrl(), { name: "To Delete" });
    const created = await createRes.json() as any;

    const res = await client.delete(`${cyclesUrl()}${created.id}/`);
    expect(res.status).toBe(204);

    // Verify it is gone
    const getRes = await client.get(`${cyclesUrl()}${created.id}/`);
    expect(getRes.status).toBe(404);
  });
});

describe("Contrato ICycle (snake_case)", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let workspaceId: string;
  let projectId: string;
  let userId: string;
  let cicloAtualId: string;
  let cicloRascunhoId: string;
  let cicloArquivadoId: string;

  /** Campos que o `ICycle` exige e que o store lê sem checar existência. */
  const CAMPOS_OBRIGATORIOS = [
    "id",
    "name",
    "description",
    "start_date",
    "end_date",
    "status",
    "archived_at",
    "owned_by_id",
    "project_id",
    "workspace_id",
    "project_detail",
    "created_at",
    "updated_at",
    "is_favorite",
    "sort_order",
    "view_props",
    "progress",
    "version",
    "assignee_ids",
    "total_issues",
    "backlog_issues",
    "unstarted_issues",
    "started_issues",
    "completed_issues",
    "cancelled_issues",
    "total_estimate_points",
    "backlog_estimate_points",
    "unstarted_estimate_points",
    "started_estimate_points",
    "completed_estimate_points",
    "cancelled_estimate_points",
  ];

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    userId = user.id;
    client = apiClient((await createApiToken(userId)).token);
    const ws = await createWorkspace(userId);
    wsSlug = ws.slug;
    workspaceId = ws.id;
    projectId = (await createProject(ws.id, userId, { cycleView: true })).id;

    const agora = Date.now();
    cicloAtualId = (
      await createCycle(projectId, workspaceId, userId, {
        name: "Ciclo em andamento",
        startDate: new Date(agora - 2 * DIA_MS),
        endDate: new Date(agora + 2 * DIA_MS),
      })
    ).id;
    cicloRascunhoId = (await createCycle(projectId, workspaceId, userId, { name: "Ciclo rascunho" })).id;
    cicloArquivadoId = (await createCycle(projectId, workspaceId, userId, { name: "Ciclo arquivado" })).id;
    await prisma.cycle.update({ where: { id: cicloArquivadoId }, data: { archivedAt: new Date() } });
  });

  afterAll(async () => {
    await cleanDb();
  });

  const proj = (caminho: string) => `/workspaces/${wsSlug}/projects/${projectId}${caminho}`;

  it("a listagem devolve array de ciclos em snake_case", async () => {
    const res = await client.get(proj("/cycles/"));
    expect(res.status).toBe(200);
    const ciclos = (await res.json()) as any[];

    expect(ciclos).toBeInstanceOf(Array);
    for (const campo of CAMPOS_OBRIGATORIOS) expect(ciclos[0]).toHaveProperty(campo);
    // Nada de camelCase vazando do Prisma.
    expect(ciclos[0].startDate).toBeUndefined();
    expect(ciclos[0].ownedById).toBeUndefined();
    expect(ciclos[0].archivedAt).toBeUndefined();
  });

  it("archivedAt: null — a listagem esconde os arquivados", async () => {
    const ciclos = (await (await client.get(proj("/cycles/"))).json()) as any[];
    const ids = ciclos.map((c) => c.id);
    expect(ids).toContain(cicloAtualId);
    expect(ids).toContain(cicloRascunhoId);
    expect(ids).not.toContain(cicloArquivadoId);
  });

  it("o status vem das datas: current, upcoming, completed e draft", async () => {
    const agora = Date.now();
    const futuro = (
      await createCycle(projectId, workspaceId, userId, {
        name: "Ciclo futuro",
        startDate: new Date(agora + 5 * DIA_MS),
        endDate: new Date(agora + 9 * DIA_MS),
      })
    ).id;
    const passado = (
      await createCycle(projectId, workspaceId, userId, {
        name: "Ciclo encerrado",
        startDate: new Date(agora - 9 * DIA_MS),
        endDate: new Date(agora - 5 * DIA_MS),
      })
    ).id;

    const ciclos = (await (await client.get(proj("/cycles/"))).json()) as any[];
    const porId = new Map(ciclos.map((c) => [c.id, c]));

    expect(porId.get(cicloAtualId).status).toBe("current");
    expect(porId.get(futuro).status).toBe("upcoming");
    expect(porId.get(passado).status).toBe("completed");
    expect(porId.get(cicloRascunhoId).status).toBe("draft");

    await prisma.cycle.deleteMany({ where: { id: { in: [futuro, passado] } } });
  });

  it("cycle_view=current traz só o ciclo em andamento", async () => {
    const ciclos = (await (await client.get(proj("/cycles/?cycle_view=current")))
      .json()) as any[];
    expect(ciclos.map((c) => c.id)).toEqual([cicloAtualId]);
  });

  it("o detalhe de um ciclo usa o mesmo contrato da listagem", async () => {
    const res = await client.get(proj(`/cycles/${cicloAtualId}/`));
    expect(res.status).toBe(200);
    const ciclo = (await res.json()) as any;
    for (const campo of CAMPOS_OBRIGATORIOS) expect(ciclo).toHaveProperty(campo);
    expect(ciclo.status).toBe("current");
    expect(ciclo.startDate).toBeUndefined();
  });

  it("criar, editar, arquivar e desarquivar também devolvem snake_case", async () => {
    const criado = (await (await client.post(proj("/cycles/"), { name: "Ciclo novo" })).json()) as any;
    expect(criado).toHaveProperty("total_estimate_points");
    expect(criado.startDate).toBeUndefined();

    const editado = (await (await client.patch(proj(`/cycles/${criado.id}/`), { name: "Ciclo renomeado" })).json()) as any;
    expect(editado.name).toBe("Ciclo renomeado");
    expect(editado).toHaveProperty("is_favorite");

    const arquivado = (await (await client.post(proj(`/cycles/${criado.id}/archive/`), {})).json()) as any;
    expect(arquivado.archived_at).not.toBeNull();

    const arquivados = (await (await client.get(proj("/archived-cycles/"))).json()) as any[];
    expect(arquivados.map((c) => c.id)).toContain(criado.id);

    const restaurado = (await (await client.delete(proj(`/cycles/${criado.id}/archive/`))).json()) as any;
    expect(restaurado.archived_at).toBeNull();

    await prisma.cycle.deleteMany({ where: { id: criado.id } });
  });

  it("a listagem de ciclos do workspace usa o mesmo contrato", async () => {
    const res = await client.get(`/workspaces/${wsSlug}/cycles/`);
    expect(res.status).toBe(200);
    const ciclos = (await res.json()) as any[];
    expect(ciclos).toBeInstanceOf(Array);

    const ciclo = ciclos.find((c) => c.id === cicloAtualId);
    expect(ciclo.status).toBe("current");
    expect(ciclo.project_detail.id).toBe(projectId);
    expect(ciclo.startDate).toBeUndefined();
  });

  it("ciclo sem datas devolve completion_chart vazio em vez de erro", async () => {
    const res = await client.get(proj(`/cycles/${cicloRascunhoId}/analytics/`));
    expect(res.status).toBe(200);
    const analytics = (await res.json()) as any;
    expect(analytics.completion_chart).toEqual({});
  });
});

describe("Rotas de ciclo que o frontend chama", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let workspaceId: string;
  let projectId: string;
  let userId: string;
  let cycleId: string;
  let outroCicloId: string;
  let issueId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    userId = user.id;
    client = apiClient((await createApiToken(userId)).token);
    const ws = await createWorkspace(userId);
    wsSlug = ws.slug;
    workspaceId = ws.id;
    projectId = (await createProject(ws.id, userId, { cycleView: true })).id;

    cycleId = (await createCycle(projectId, workspaceId, userId, { name: "Ciclo com chamados" })).id;
    outroCicloId = (await createCycle(projectId, workspaceId, userId, { name: "Outro ciclo" })).id;
    issueId = (await createIssue(projectId, workspaceId, { name: "Chamado do ciclo", sequenceId: 1 })).id;
  });

  afterAll(async () => {
    await cleanDb();
  });

  const proj = (caminho: string) => `/workspaces/${wsSlug}/projects/${projectId}${caminho}`;

  it("POST cycle-issues/ vincula o chamado ao ciclo", async () => {
    const res = await client.post(proj(`/cycles/${cycleId}/cycle-issues/`), { issues: [issueId] });
    expect(res.status).toBe(201);

    const vinculos = await prisma.cycleIssue.count({ where: { cycleId, issueId, deletedAt: null } });
    expect(vinculos).toBe(1);
  });

  it("POST cycle-issues/ sem chamados devolve 400", async () => {
    const res = await client.post(proj(`/cycles/${cycleId}/cycle-issues/`), { issues: [] });
    expect(res.status).toBe(400);
  });

  it("GET cycle-issues/ e GET issues/ devolvem o mesmo envelope de chamados", async () => {
    const viaCycleIssues = (await (await client.get(proj(`/cycles/${cycleId}/cycle-issues/`))).json()) as any;
    const viaIssues = (await (await client.get(proj(`/cycles/${cycleId}/issues/`))).json()) as any;

    expect(viaCycleIssues.results).toBeInstanceOf(Array);
    expect(viaCycleIssues.results.map((i: any) => i.id)).toEqual([issueId]);
    expect(viaCycleIssues.total_count).toBe(1);
    // Chamado em snake_case, com o ciclo preenchido.
    expect(viaCycleIssues.results[0].sequence_id).toBe(1);
    expect(viaCycleIssues.results[0].cycle_id).toBe(cycleId);
    expect(viaIssues.results.map((i: any) => i.id)).toEqual([issueId]);
  });

  it("GET cycle-issues/?group_by=priority devolve resposta agrupada", async () => {
    const agrupado = (await (await client.get(proj(`/cycles/${cycleId}/cycle-issues/?group_by=priority`))).json()) as any;
    expect(agrupado.total_count).toBe(1);
    expect(agrupado.results.none.results.map((i: any) => i.id)).toEqual([issueId]);
    expect(agrupado.results.urgent.results).toEqual([]);
  });

  it("group_by desconhecido cai na resposta plana em vez de inventar grupos", async () => {
    const plano = (await (await client.get(proj(`/cycles/${cycleId}/cycle-issues/?group_by=labels`))).json()) as any;
    expect(plano.results).toBeInstanceOf(Array);
    expect(plano.results.map((i: any) => i.id)).toEqual([issueId]);
  });

  it("mover o chamado para outro ciclo desfaz o vínculo anterior", async () => {
    const res = await client.post(proj(`/cycles/${outroCicloId}/cycle-issues/`), { issues: [issueId] });
    expect(res.status).toBe(201);

    expect(await prisma.cycleIssue.count({ where: { cycleId, issueId, deletedAt: null } })).toBe(0);
    expect(await prisma.cycleIssue.count({ where: { cycleId: outroCicloId, issueId, deletedAt: null } })).toBe(1);

    // Devolve ao ciclo original para os testes seguintes.
    await client.post(proj(`/cycles/${cycleId}/cycle-issues/`), { issues: [issueId] });
  });

  it("DELETE cycle-issues/:issue_id/ remove o vínculo", async () => {
    const res = await client.delete(proj(`/cycles/${cycleId}/cycle-issues/${issueId}/`));
    expect(res.status).toBe(204);
    expect(await prisma.cycleIssue.count({ where: { cycleId, issueId, deletedAt: null } })).toBe(0);

    await client.post(proj(`/cycles/${cycleId}/cycle-issues/`), { issues: [issueId] });
  });

  it("GET cycle-progress/ devolve o mesmo instantâneo de progress/", async () => {
    const pro = await client.get(proj(`/cycles/${cycleId}/cycle-progress/`));
    expect(pro.status).toBe(200);
    const progressoPro = (await pro.json()) as any;
    const progresso = (await (await client.get(proj(`/cycles/${cycleId}/progress/`))).json()) as any;

    expect(progressoPro).toEqual(progresso);
    expect(progressoPro.total_issues).toBe(1);
    expect(progressoPro).toHaveProperty("total_estimate_points");
  });

  it("cycle-progress/ de ciclo inexistente devolve 404", async () => {
    const res = await client.get(proj("/cycles/00000000-0000-0000-0000-000000000000/cycle-progress/"));
    expect(res.status).toBe(404);
  });

  it("user-favorite-cycles/ favorita, lista e desfavorita", async () => {
    const antes = (await (await client.get(proj(`/cycles/${cycleId}/`))).json()) as any;
    expect(antes.is_favorite).toBe(false);

    const criado = await client.post(proj("/user-favorite-cycles/"), { cycle: cycleId });
    expect(criado.status).toBe(201);

    const favoritos = (await (await client.get(proj("/user-favorite-cycles/"))).json()) as any[];
    expect(favoritos).toBeInstanceOf(Array);
    expect(favoritos.map((f) => f.cycle)).toEqual([cycleId]);
    expect(favoritos[0].cycle_detail.name).toBe("Ciclo com chamados");

    const depois = (await (await client.get(proj(`/cycles/${cycleId}/`))).json()) as any;
    expect(depois.is_favorite).toBe(true);

    // Favoritar de novo não duplica a linha.
    await client.post(proj("/user-favorite-cycles/"), { cycle: cycleId });
    expect(await prisma.userFavorite.count({ where: { entityType: "cycle", entityId: cycleId, deletedAt: null } })).toBe(1);

    const removido = await client.delete(proj(`/user-favorite-cycles/${cycleId}/`));
    expect(removido.status).toBe(204);
    const final = (await (await client.get(proj(`/cycles/${cycleId}/`))).json()) as any;
    expect(final.is_favorite).toBe(false);
  });

  it("user-favorite-cycles/ recusa ciclo que não é do projeto", async () => {
    const res = await client.post(proj("/user-favorite-cycles/"), {
      cycle: "00000000-0000-0000-0000-000000000000",
    });
    expect(res.status).toBe(400);
  });

  it("user-properties grava e devolve rich_filters", async () => {
    const inicial = (await (await client.get(proj(`/cycles/${cycleId}/user-properties/`))).json()) as any;
    expect(inicial.rich_filters).toEqual({});

    const richFilters = { and: [{ state_group__in: ["started"] }] };
    const gravado = (await (
      await client.patch(proj(`/cycles/${cycleId}/user-properties/`), {
        rich_filters: richFilters,
        display_filters: { group_by: "state" },
      })
    ).json()) as any;
    expect(gravado.rich_filters).toEqual(richFilters);
    expect(gravado.display_filters).toEqual({ group_by: "state" });

    const relido = (await (await client.get(proj(`/cycles/${cycleId}/user-properties/`))).json()) as any;
    expect(relido.rich_filters).toEqual(richFilters);

    // Atualizar só o display_filters preserva os rich_filters já gravados.
    const parcial = (await (
      await client.patch(proj(`/cycles/${cycleId}/user-properties/`), { display_filters: { group_by: "priority" } })
    ).json()) as any;
    expect(parcial.rich_filters).toEqual(richFilters);
  });
});

describe("Pontos de estimativa do ciclo", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let workspaceId: string;
  let projectId: string;
  let userId: string;
  let cycleId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    userId = user.id;
    client = apiClient((await createApiToken(userId)).token);
    const ws = await createWorkspace(userId);
    wsSlug = ws.slug;
    workspaceId = ws.id;
    projectId = (await createProject(ws.id, userId, { cycleView: true })).id;
    cycleId = (await createCycle(projectId, workspaceId, userId, { name: "Ciclo com pontos" })).id;

    const estimate = await prisma.estimate.create({
      data: { workspaceId, projectId, name: "Fibonacci", type: "points" },
    });
    const ponto = async (chave: number, valor: string) =>
      prisma.estimatePoint.create({
        data: { estimateId: estimate.id, workspaceId, projectId, key: chave, value: valor },
      });
    const p2 = await ponto(1, "2");
    const p3 = await ponto(2, "3");
    const p5 = await ponto(3, "5");
    // Escala de categorias: valor não numérico não pode entrar na soma.
    const pAlto = await ponto(4, "Alto");

    const emAndamento = await createState(projectId, workspaceId, { name: "Em execução", group: "started" });
    const concluido = await createState(projectId, workspaceId, { name: "Resolvido", group: "completed" });

    const vincular = async (nome: string, sequencia: number, stateId: string | null, estimatePointId: string | null) => {
      const issue = await createIssue(projectId, workspaceId, { name: nome, sequenceId: sequencia, stateId: stateId ?? undefined });
      if (estimatePointId) await prisma.issue.update({ where: { id: issue.id }, data: { estimatePointId } });
      await prisma.cycleIssue.create({ data: { cycleId, issueId: issue.id, workspaceId, projectId } });
      return issue.id;
    };

    await vincular("Started 2 pontos", 1, emAndamento.id, p2.id);
    await vincular("Started 3 pontos", 2, emAndamento.id, p3.id);
    await vincular("Completed 5 pontos", 3, concluido.id, p5.id);
    await vincular("Completed sem ponto", 4, concluido.id, null);
    // Sem etapa cai em backlog; ponto não numérico soma zero.
    await vincular("Backlog ponto textual", 5, null, pAlto.id);
  });

  afterAll(async () => {
    await cleanDb();
  });

  const proj = (caminho: string) => `/workspaces/${wsSlug}/projects/${projectId}${caminho}`;

  it("progress/ soma o valor numérico do EstimatePoint por grupo de etapa", async () => {
    const progresso = (await (await client.get(proj(`/cycles/${cycleId}/progress/`))).json()) as any;

    expect(progresso.total_issues).toBe(5);
    expect(progresso.started_issues).toBe(2);
    expect(progresso.completed_issues).toBe(2);
    expect(progresso.backlog_issues).toBe(1);

    expect(progresso.started_estimate_points).toBe(5); // 2 + 3
    expect(progresso.completed_estimate_points).toBe(5); // 5 + (sem ponto = 0)
    expect(progresso.backlog_estimate_points).toBe(0); // "Alto" não é número
    expect(progresso.unstarted_estimate_points).toBe(0);
    expect(progresso.cancelled_estimate_points).toBe(0);
    expect(progresso.total_estimate_points).toBe(10);
  });

  it("a listagem de ciclos carrega os mesmos pontos", async () => {
    const ciclos = (await (await client.get(proj("/cycles/"))).json()) as any[];
    const ciclo = ciclos.find((c) => c.id === cycleId);

    expect(ciclo.total_estimate_points).toBe(10);
    expect(ciclo.started_estimate_points).toBe(5);
    expect(ciclo.completed_estimate_points).toBe(5);
    expect(ciclo.total_issues).toBe(5);
  });

  it("analytics?type=points pesa a distribuição pelos pontos", async () => {
    const porChamado = (await (await client.get(proj(`/cycles/${cycleId}/analytics/`))).json()) as any;
    const porPontos = (await (await client.get(proj(`/cycles/${cycleId}/analytics/?type=points`))).json()) as any;

    const somaEtapas = (analytics: any, chave: string) =>
      analytics.states.reduce((total: number, etapa: any) => total + etapa[chave], 0);

    expect(somaEtapas(porChamado, "total_issues")).toBe(5);
    expect(somaEtapas(porPontos, "total_estimates")).toBe(10);

    const concluidoPorPontos = porPontos.states.find((e: any) => e.group === "completed");
    expect(concluidoPorPontos.completed_estimates).toBe(5);
    expect(concluidoPorPontos.pending_estimates).toBe(0);
  });
});
