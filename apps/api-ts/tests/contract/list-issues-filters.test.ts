/**
 * Filtros de listagem de chamados — nível de PROJETO e nível de WORKSPACE.
 *
 * O painel de filtros do frontend manda tudo em `filters` (JSON, com nós
 * and/or); integrações e links diretos mandam params soltos. Os dois formatos
 * precisam produzir o mesmo recorte, e um filtro que não casa com nada tem que
 * devolver lista vazia — nunca a lista inteira (falha silenciosa clássica).
 */
import {afterAll, beforeAll, describe, expect, it} from "bun:test";
import prisma from "@db";
import {cleanDb} from "@tests/helpers/setup";
import {inicioRecebido} from "@utils/prazo";
import {
  addAssignee,
  addLabelToIssue,
  addMention,
  addSubscriber,
  apiClient,
  createApiToken,
  createCycle,
  createEntity,
  createIssue,
  createLabel,
  createMemberWithToken,
  createModule,
  createProject,
  createUser,
  createWorkspace,
  projectStates,
} from "@tests/helpers/factory";

type Envelope = {
  results: any[];
  total_count: number;
  total_results: number;
  next_cursor: string;
  prev_cursor: string;
  next_page_results: boolean;
  prev_page_results: boolean;
};

const ids = (e: Envelope) => e.results.map((i) => i.id).sort();

describe("Filtros de chamados", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let workspaceId: string;
  let projectA: string;
  let projectB: string;
  let adminId: string;
  let assigneeId: string;
  let watcherId: string;
  let entity1: string;
  let entity2: string;
  let labelCorrecaoA: string;
  let labelCorrecaoB: string;
  let labelMelhoria: string;
  let cycleId: string;
  let moduleId: string;
  let stateTodo: string;
  let stateProgress: string;
  let stateDone: string;
  let stateTodoB: string;
  // chamados
  let i1: string; // urgent / Todo / Correção / assignee / entity1 / datas
  let i2: string; // high / In Progress / Melhoria / entity2 / mention+subscriber
  let i3: string; // none / Done / criado por outro usuário
  let i4: string; // ciclo + módulo
  let i5: string; // projeto B, urgent, label "Correção" (mesmo nome)

  beforeAll(async () => {
    await cleanDb();
    const admin = await createUser();
    adminId = admin.id;
    const token = await createApiToken(admin.id);
    client = apiClient(token.token);
    const ws = await createWorkspace(admin.id);
    wsSlug = ws.slug;
    workspaceId = ws.id;

    projectA = (await createProject(ws.id, admin.id, {identifier: "PRJA"})).id;
    projectB = (await createProject(ws.id, admin.id, {identifier: "PRJB"})).id;

    const statesA = await projectStates(projectA);
    stateTodo = statesA.byName.get("Todo")!.id;
    stateProgress = statesA.byName.get("In Progress")!.id;
    stateDone = statesA.byName.get("Done")!.id;
    stateTodoB = (await projectStates(projectB)).byName.get("Todo")!.id;

    const assignee = await createMemberWithToken(ws.id, 15, projectA, 15);
    assigneeId = assignee.user.id;
    const watcher = await createMemberWithToken(ws.id, 15, projectA, 15);
    watcherId = watcher.user.id;

    entity1 = (await createEntity(ws.id, {name: "Prefeitura Alfa"})).id;
    entity2 = (await createEntity(ws.id, {name: "Prefeitura Beta"})).id;

    labelCorrecaoA = (await createLabel(projectA, ws.id, {name: "Correção"})).id;
    labelMelhoria = (await createLabel(projectA, ws.id, {name: "Melhoria"})).id;
    labelCorrecaoB = (await createLabel(projectB, ws.id, {name: "Correção"})).id;

    cycleId = (await createCycle(projectA, ws.id, admin.id, {name: "Sprint 1"})).id;
    moduleId = (await createModule(projectA, ws.id, {name: "Financeiro"})).id;

    i1 = (
      await createIssue(projectA, workspaceId, {
        name: "Erro no login",
        priority: "urgent",
        stateId: stateTodo,
        entityId: entity1,
        createdById: adminId,
        // Grava o mesmo instante que a API grava ao receber "2026-01-01":
        // meia-noite NO FUSO DO ESCRITÓRIO. Cravar meia-noite UTC punha o
        // início às 20h do dia 31/12 para quem olha a tela, e o filtro por
        // 01/01 — que agora recorta o dia local — deixava de encontrá-lo.
        startDate: inicioRecebido("2026-01-01")!,
        targetDate: new Date("2026-01-10"),
        sequenceId: 1,
        legacyTicketNumber: "458325",
      })
    ).id;
    await addLabelToIssue(i1, labelCorrecaoA, projectA, workspaceId);
    await addAssignee(i1, assigneeId, projectA, workspaceId);

    i2 = (
      await createIssue(projectA, workspaceId, {
        name: "Relatório lento",
        priority: "high",
        stateId: stateProgress,
        entityId: entity2,
        createdById: adminId,
        targetDate: new Date("2026-02-20"),
        sequenceId: 2,
      })
    ).id;
    await addLabelToIssue(i2, labelMelhoria, projectA, workspaceId);
    await addMention(i2, watcherId, projectA, workspaceId);
    await addSubscriber(i2, watcherId, projectA, workspaceId);

    i3 = (
      await createIssue(projectA, workspaceId, {
        name: "Ajuste concluído",
        priority: "none",
        stateId: stateDone,
        createdById: assigneeId,
        sequenceId: 3,
      })
    ).id;

    i4 = (await createIssue(projectA, workspaceId, {name: "No ciclo e no módulo", priority: "low", sequenceId: 4})).id;
    await prisma.cycleIssue.create({data: {cycleId, issueId: i4, projectId: projectA, workspaceId}});
    await prisma.moduleIssue.create({data: {moduleId, issueId: i4, projectId: projectA, workspaceId}});

    i5 = (
      await createIssue(projectB, workspaceId, {name: "Outro projeto", priority: "urgent", stateId: stateTodoB, sequenceId: 1})
    ).id;
    await addLabelToIssue(i5, labelCorrecaoB, projectB, workspaceId);
  });

  afterAll(() => cleanDb());

  const projectUrl = () => `/workspaces/${wsSlug}/projects/${projectA}/issues/`;
  const wsUrl = () => `/workspaces/${wsSlug}/issues/`;

  async function listProject(qs = ""): Promise<Envelope> {
    const res = await client.get(`${projectUrl()}${qs}`);
    expect(res.status).toBe(200);
    return (await res.json()) as Envelope;
  }

  async function listWorkspace(qs = ""): Promise<Envelope> {
    const res = await client.get(`${wsUrl()}${qs}`);
    expect(res.status).toBe(200);
    return (await res.json()) as Envelope;
  }

  const jsonFilters = (conditions: Record<string, unknown>[]) =>
    `?filters=${encodeURIComponent(JSON.stringify({and: conditions}))}`;

  // ── Forma da resposta e paginação ──────────────────────────────────────────

  describe("envelope e paginação", () => {
    it("devolve o envelope paginado completo", async () => {
      const page = await listProject();
      expect(page.results).toBeInstanceOf(Array);
      expect(page.total_count).toBe(4);
      expect(page.total_results).toBe(4);
      expect(page.next_cursor).toBe("100:1:0");
      expect(page.prev_cursor).toBe("100:0:1");
      expect(page.next_page_results).toBe(false);
      expect(page.prev_page_results).toBe(false);
    });

    it("cada item traz o contrato do serializer de chamado", async () => {
      const page = await listProject();
      const item = page.results.find((i) => i.id === i1);
      expect(item.sequence_id).toBe(1);
      expect(item.priority).toBe("urgent");
      expect(item.label_ids).toEqual([labelCorrecaoA]);
      expect(item.assignee_ids).toEqual([assigneeId]);
      expect(item.state__group).toBe("unstarted");
      expect(item.target_date).toBe("2026-01-10T00:00:00.000Z");
      expect(item.entity).toMatchObject({id: entity1, name: "Prefeitura Alfa"});
    });

    it("navega pelas páginas usando o cursor", async () => {
      const first = await listProject("?cursor=2:0:0");
      expect(first.results).toHaveLength(2);
      expect(first.total_count).toBe(4);
      expect(first.next_page_results).toBe(true);
      expect(first.prev_page_results).toBe(false);

      const second = await listProject(`?cursor=${first.next_cursor}`);
      expect(second.results).toHaveLength(2);
      expect(second.next_page_results).toBe(false);
      expect(second.prev_page_results).toBe(true);

      // páginas disjuntas
      const overlap = ids(first).filter((id) => ids(second).includes(id));
      expect(overlap).toEqual([]);
    });

    it("página além do fim devolve lista vazia mas mantém o total", async () => {
      const page = await listProject("?cursor=2:99:0");
      expect(page.results).toEqual([]);
      expect(page.total_count).toBe(4);
    });
  });

  // ── Ordenação ──────────────────────────────────────────────────────────────

  describe("ordenação", () => {
    it("order_by=sequence_id ordena ascendente", async () => {
      const page = await listProject("?order_by=sequence_id");
      expect(page.results.map((i) => i.sequence_id)).toEqual([1, 2, 3, 4]);
    });

    it("order_by=-sequence_id inverte", async () => {
      const page = await listProject("?order_by=-sequence_id");
      expect(page.results.map((i) => i.sequence_id)).toEqual([4, 3, 2, 1]);
    });

    it("order_by desconhecido cai no padrão sem erro", async () => {
      const page = await listProject("?order_by=campo_inexistente");
      expect(page.results).toHaveLength(4);
    });

    it("order_by=target_date coloca os sem prazo por último", async () => {
      const page = await listProject("?order_by=target_date");
      const withDates = page.results.filter((i) => i.target_date).map((i) => i.target_date);
      expect(withDates).toEqual(["2026-01-10T00:00:00.000Z", "2026-02-20T00:00:00.000Z"]);
    });
  });

  // ── Filtros isolados ───────────────────────────────────────────────────────

  describe("filtros isolados (params soltos)", () => {
    it("priority", async () => {
      expect(ids(await listProject("?priority=urgent"))).toEqual([i1]);
      expect(ids(await listProject("?priority=urgent,high")).sort()).toEqual([i1, i2].sort());
    });

    it("state (id)", async () => {
      expect(ids(await listProject(`?state=${stateDone}`))).toEqual([i3]);
    });

    it("state_group", async () => {
      expect(ids(await listProject("?state_group=completed"))).toEqual([i3]);
      expect(ids(await listProject("?state_group=unstarted,started")).sort()).toEqual([i1, i2].sort());
    });

    it("labels", async () => {
      expect(ids(await listProject(`?labels=${labelMelhoria}`))).toEqual([i2]);
    });

    it("assignees", async () => {
      expect(ids(await listProject(`?assignees=${assigneeId}`))).toEqual([i1]);
    });

    it("created_by", async () => {
      expect(ids(await listProject(`?created_by=${assigneeId}`))).toEqual([i3]);
    });

    it("entity (entity_id__in)", async () => {
      expect(ids(await listProject(`?entity_id__in=${entity1}`))).toEqual([i1]);
      expect(ids(await listProject(`?entity_id__in=${entity1},${entity2}`)).sort()).toEqual([i1, i2].sort());
    });

    it("mentions", async () => {
      expect(ids(await listProject(`?mention_id__in=${watcherId}`))).toEqual([i2]);
    });

    it("subscriber", async () => {
      expect(ids(await listProject(`?subscriber_id__in=${watcherId}`))).toEqual([i2]);
    });

    it("cycle", async () => {
      expect(ids(await listProject(`?cycle_id__in=${cycleId}`))).toEqual([i4]);
    });

    it("module", async () => {
      expect(ids(await listProject(`?module_id__in=${moduleId}`))).toEqual([i4]);
    });

    it("target_date como intervalo", async () => {
      expect(ids(await listProject("?target_date=2026-01-01;2026-01-31"))).toEqual([i1]);
      expect(ids(await listProject("?target_date=2026-01-01;2026-12-31")).sort()).toEqual([i1, i2].sort());
    });

    it("start_date exato", async () => {
      expect(ids(await listProject("?start_date=2026-01-01"))).toEqual([i1]);
    });

    it("legacy_ticket_number", async () => {
      expect(ids(await listProject("?legacy_ticket_number=458325"))).toEqual([i1]);
    });
  });

  // ── Formato JSON do painel de filtros ──────────────────────────────────────

  describe("formato JSON `filters`", () => {
    it("condição única aninhada em `and`", async () => {
      expect(ids(await listProject(jsonFilters([{priority__in: "urgent"}])))).toEqual([i1]);
    });

    it("condições aninhadas em `or` dentro de `and`", async () => {
      const qs = `?filters=${encodeURIComponent(
        JSON.stringify({and: [{or: [{priority__in: "urgent"}, {priority__in: "high"}]}]}),
      )}`;
      expect(ids(await listProject(qs)).sort()).toEqual([i1, i2].sort());
    });

    it("formato plano (sem and/or)", async () => {
      const qs = `?filters=${encodeURIComponent(JSON.stringify({state_group__in: "completed"}))}`;
      expect(ids(await listProject(qs))).toEqual([i3]);
    });

    it("JSON e param solto se somam", async () => {
      const qs = `${jsonFilters([{state_group__in: "unstarted"}])}&priority=urgent`;
      expect(ids(await listProject(qs))).toEqual([i1]);
    });

    it("JSON malformado é ignorado (não derruba a listagem)", async () => {
      const page = await listProject("?filters=%7Bnao-e-json");
      expect(page.results).toHaveLength(4);
    });
  });

  // ── Filtros combinados ─────────────────────────────────────────────────────

  describe("filtros combinados", () => {
    it("prioridade + grupo de estado", async () => {
      expect(ids(await listProject("?priority=urgent&state_group=unstarted"))).toEqual([i1]);
      expect(await listProject("?priority=urgent&state_group=completed").then(ids)).toEqual([]);
    });

    it("label + responsável + entidade", async () => {
      const qs = `?labels=${labelCorrecaoA}&assignees=${assigneeId}&entity_id__in=${entity1}`;
      expect(ids(await listProject(qs))).toEqual([i1]);
    });

    it("três filtros em que um não casa devolve vazio", async () => {
      const qs = `?labels=${labelCorrecaoA}&assignees=${assigneeId}&priority=low`;
      expect(ids(await listProject(qs))).toEqual([]);
    });

    it("intervalo de datas + prioridade", async () => {
      expect(ids(await listProject("?target_date=2026-02-01;2026-03-01&priority=high"))).toEqual([i2]);
    });
  });

  // ── Filtros que não casam e valores inválidos ──────────────────────────────

  describe("valores sem correspondência ou inválidos", () => {
    it("prioridade inexistente devolve lista vazia", async () => {
      const page = await listProject("?priority=critica");
      expect(page.results).toEqual([]);
      expect(page.total_count).toBe(0);
    });

    it("grupo de estado inexistente devolve lista vazia", async () => {
      expect(ids(await listProject("?state_group=inexistente"))).toEqual([]);
    });

    it("uuid válido porém inexistente devolve lista vazia", async () => {
      expect(ids(await listProject("?assignees=00000000-0000-0000-0000-000000000000"))).toEqual([]);
      expect(ids(await listProject("?labels=00000000-0000-0000-0000-000000000000"))).toEqual([]);
    });

    it("data inválida é ignorada em vez de derrubar a rota", async () => {
      const page = await listProject("?target_date=ontem");
      expect(page.results).toHaveLength(4);
    });

    it("parâmetro desconhecido é ignorado", async () => {
      const page = await listProject("?filtro_que_nao_existe=1");
      expect(page.results).toHaveLength(4);
    });
  });

  // ── group_by ───────────────────────────────────────────────────────────────

  describe("group_by", () => {
    it("agrupa por prioridade com um bloco por valor conhecido", async () => {
      const res = await client.get(`${projectUrl()}?group_by=priority`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.total_count).toBe(4);
      expect(Object.keys(data.results).sort()).toEqual(["high", "low", "medium", "none", "urgent"]);
      expect(data.results.urgent.results.map((i: any) => i.id)).toEqual([i1]);
      expect(data.results.medium.results).toEqual([]);
      expect(data.results.urgent.total_results).toBe(1);
    });

    it("agrupa por state__group", async () => {
      const res = await client.get(`${projectUrl()}?group_by=state__group`);
      const data = (await res.json()) as any;
      expect(Object.keys(data.results).sort()).toEqual([
        "backlog",
        "cancelled",
        "completed",
        "started",
        "triage",
        "unstarted",
      ]);
      expect(data.results.completed.results.map((i: any) => i.id)).toEqual([i3]);
    });

    it("agrupa por state_id usando os estados do projeto", async () => {
      const res = await client.get(`${projectUrl()}?group_by=state_id`);
      const data = (await res.json()) as any;
      expect(data.results[stateDone].results.map((i: any) => i.id)).toEqual([i3]);
    });

    it("group_by respeita os filtros aplicados", async () => {
      const res = await client.get(`${projectUrl()}?group_by=priority&state_group=completed`);
      const data = (await res.json()) as any;
      expect(data.total_count).toBe(1);
      expect(data.results.none.results.map((i: any) => i.id)).toEqual([i3]);
      expect(data.results.urgent.results).toEqual([]);
    });
  });

  // ── Nível de workspace ─────────────────────────────────────────────────────

  describe("listagem no nível do workspace", () => {
    it("devolve chamados de todos os projetos em que o usuário é membro", async () => {
      const page = await listWorkspace();
      expect(ids(page)).toEqual([i1, i2, i3, i4, i5].sort());
    });

    it("project_id limita a um projeto", async () => {
      expect(ids(await listWorkspace(`?project_id=${projectB}`))).toEqual([i5]);
    });

    it("filtro project (CSV) respeita os projetos acessíveis", async () => {
      expect(ids(await listWorkspace(`?project_id__in=${projectA}`)).sort()).toEqual([i1, i2, i3, i4].sort());
    });

    it("entity_id filtra no nível do workspace", async () => {
      expect(ids(await listWorkspace(`?entity_id=${entity2}`))).toEqual([i2]);
    });

    it("um id de label casa com os labels de mesmo nome em outros projetos", async () => {
      // "Correção" existe nos dois projetos com ids diferentes; a visão de
      // workspace deduplica por nome, então selecionar um id traz os dois.
      expect(ids(await listWorkspace(`?labels=${labelCorrecaoA}`)).sort()).toEqual([i1, i5].sort());
    });

    it("um id de estado casa com os estados de mesmo nome em outros projetos", async () => {
      expect(ids(await listWorkspace(`?state=${stateTodo}`)).sort()).toEqual([i1, i5].sort());
    });

    it("state_group resolve em todos os projetos do workspace", async () => {
      expect(ids(await listWorkspace("?state_group=unstarted")).sort()).toEqual([i1, i5].sort());
    });

    it("type=my_issues traz apenas os atribuídos ao chamador", async () => {
      const page = await listWorkspace("?type=my_issues");
      expect(page.results).toEqual([]);
    });

    it("assignees=me é um apelido para o próprio usuário", async () => {
      await addAssignee(i3, adminId, projectA, workspaceId);
      expect(ids(await listWorkspace("?assignees=me"))).toEqual([i3]);
      await prisma.issueAssignee.deleteMany({where: {issueId: i3, assigneeId: adminId}});
    });

    it("combina prioridade e entidade", async () => {
      expect(ids(await listWorkspace(`?priority=high&entity_id__in=${entity2}`))).toEqual([i2]);
      expect(ids(await listWorkspace(`?priority=urgent&entity_id__in=${entity2}`))).toEqual([]);
    });

    it("aceita o mesmo JSON `filters` do nível de projeto", async () => {
      const qs = `?filters=${encodeURIComponent(JSON.stringify({and: [{priority__in: "urgent"}]}))}`;
      expect(ids(await listWorkspace(qs)).sort()).toEqual([i1, i5].sort());
    });

    it("filtro sem correspondência devolve lista vazia", async () => {
      const page = await listWorkspace("?priority=critica");
      expect(page.results).toEqual([]);
      expect(page.total_count).toBe(0);
    });
  });

  // ── Isolamento e autorização ───────────────────────────────────────────────

  describe("isolamento e autorização", () => {
    it("chamados de outro workspace nunca aparecem", async () => {
      const outsider = await createUser();
      const otherWs = await createWorkspace(outsider.id);
      const otherProject = await createProject(otherWs.id, outsider.id);
      await createIssue(otherProject.id, otherWs.id, {name: "Segredo alheio", priority: "urgent"});

      const page = await listWorkspace("?priority=urgent");
      expect(page.results.every((i: any) => i.workspace_id === workspaceId)).toBe(true);
      expect(page.results.some((i: any) => i.name === "Segredo alheio")).toBe(false);
    });

    it("membro do workspace sem acesso ao projeto não vê os chamados dele", async () => {
      const stranger = await createMemberWithToken(workspaceId, 15);
      const strangerClient = apiClient(stranger.token);
      const res = await strangerClient.get(wsUrl());
      expect(res.status).toBe(200);
      expect(((await res.json()) as Envelope).results).toEqual([]);
    });

    it("sem token devolve 401", async () => {
      const anon = apiClient("token-invalido");
      expect((await anon.get(projectUrl())).status).toBe(401);
      expect((await anon.get(wsUrl())).status).toBe(401);
    });

    it("não-membro do workspace recebe 403", async () => {
      const outsider = await createUser();
      const token = await createApiToken(outsider.id);
      const outsiderClient = apiClient(token.token);
      expect((await outsiderClient.get(wsUrl())).status).toBe(403);
      expect((await outsiderClient.get(projectUrl())).status).toBe(403);
    });

    it("workspace inexistente devolve 404", async () => {
      const res = await client.get(`/workspaces/nao-existe/issues/`);
      expect(res.status).toBe(404);
    });

    it("projeto inexistente devolve 404", async () => {
      const res = await client.get(
        `/workspaces/${wsSlug}/projects/00000000-0000-0000-0000-000000000000/issues/`,
      );
      expect(res.status).toBe(404);
    });
  });
});
