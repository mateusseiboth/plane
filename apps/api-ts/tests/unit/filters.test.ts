/**
 * Filtros de chamados — o frontend empacota os filtros de work item num único
 * query param `filters` (JSON, com nós aninhados and/or) e às vezes também manda
 * params soltos. normalizeFilters funde as duas fontes; applyIssueFilters traduz
 * o resultado num `where` do Prisma.
 *
 * Cada campo aceito é coberto isolado e combinado, porque uma chave não
 * reconhecida faz o filtro ser SILENCIOSAMENTE ignorado (não dá erro).
 */
import {afterAll, beforeAll, describe, expect, it} from "bun:test";
import prisma from "@db";
import {cleanDb} from "@tests/helpers/setup";
import {createLabel, createProject, createUser, createWorkspace} from "@tests/helpers/factory";
import {applyIssueFilters, normalizeFilters} from "@utils/filters";

describe("normalizeFilters", () => {
  it("aceita os aliases Django de cada campo", () => {
    expect(normalizeFilters({priority__in: "urgent,high"})).toEqual({priority: ["urgent", "high"]});
    expect(normalizeFilters({state_id__in: "s1"})).toEqual({state: ["s1"]});
    expect(normalizeFilters({state__group__in: "backlog"})).toEqual({state_group: ["backlog"]});
    expect(normalizeFilters({assignee_id__in: "u1"})).toEqual({assignees: ["u1"]});
    expect(normalizeFilters({label__in: "l1"})).toEqual({labels: ["l1"]});
    expect(normalizeFilters({entity_id__in: "e1"})).toEqual({entity: ["e1"]});
    expect(normalizeFilters({created_by_id__in: "u2"})).toEqual({created_by: ["u2"]});
    expect(normalizeFilters({mention__in: "u3"})).toEqual({mentions: ["u3"]});
    expect(normalizeFilters({project_id__in: "p1"})).toEqual({project: ["p1"]});
    expect(normalizeFilters({subscriber_id__in: "u4"})).toEqual({subscriber: ["u4"]});
    expect(normalizeFilters({cycle_id__in: "c1"})).toEqual({cycle: ["c1"]});
    expect(normalizeFilters({module_id__in: "m1"})).toEqual({module: ["m1"]});
    expect(normalizeFilters({start_date: "2026-01-01"})).toEqual({start_date: ["2026-01-01"]});
    expect(normalizeFilters({target_date: "2026-01-31"})).toEqual({target_date: ["2026-01-31"]});
  });

  it("quebra CSV, achata arrays e descarta vazios", () => {
    expect(normalizeFilters({priority: "urgent, high ,,low"})).toEqual({priority: ["urgent", "high", "low"]});
    expect(normalizeFilters({labels: ["a,b", "c"]})).toEqual({labels: ["a", "b", "c"]});
    expect(normalizeFilters({priority: ""})).toEqual({});
    expect(normalizeFilters({priority: null})).toEqual({});
    expect(normalizeFilters({priority: undefined})).toEqual({});
  });

  it("ignora chaves desconhecidas em vez de explodir", () => {
    expect(normalizeFilters({foo: "bar", cursor: "100:0:0", per_page: "20"})).toEqual({});
  });

  it("lê o JSON `filters` do frontend, inclusive aninhado em and/or", () => {
    const filters = JSON.stringify({
      and: [{state_group__in: "started"}, {or: [{priority__in: "medium"}, {priority__in: "urgent"}]}],
    });
    expect(normalizeFilters({filters})).toEqual({
      state_group: ["started"],
      priority: ["medium", "urgent"],
    });
  });

  it("aceita o formato plano (sem and/or) do JSON `filters`", () => {
    const filters = JSON.stringify({priority__in: "high", labels__in: ["l1", "l2"]});
    expect(normalizeFilters({filters})).toEqual({priority: ["high"], labels: ["l1", "l2"]});
  });

  it("funde o JSON `filters` com os params soltos", () => {
    const out = normalizeFilters({
      filters: JSON.stringify({priority__in: "high"}),
      state_group: "started",
    });
    expect(out).toEqual({priority: ["high"], state_group: ["started"]});
  });

  it("ignora `filters` malformado sem perder os params soltos", () => {
    expect(normalizeFilters({filters: "{isso não é json", priority: "low"})).toEqual({priority: ["low"]});
  });

  it("ignora `filters` que não é objeto/array", () => {
    expect(normalizeFilters({filters: "42"})).toEqual({});
    expect(normalizeFilters({filters: "null"})).toEqual({});
  });

  it("acumula o mesmo campo vindo das duas fontes", () => {
    const out = normalizeFilters({
      filters: JSON.stringify({priority__in: "high"}),
      priority: "urgent",
    });
    expect(out.priority.sort()).toEqual(["high", "urgent"]);
  });
});

describe("applyIssueFilters", () => {
  let workspaceId: string;
  let projectId: string;
  let otherProjectId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    const ws = await createWorkspace(user.id);
    workspaceId = ws.id;
    projectId = (await createProject(ws.id, user.id)).id;
    otherProjectId = (await createProject(ws.id, user.id)).id;
  });

  afterAll(() => cleanDb());

  const scopeProject = () => ({projectId});
  const scopeWorkspace = () => ({workspaceId});

  it("mapeia os campos escalares direto para colunas", async () => {
    const where = await applyIssueFilters({}, normalizeFilters({priority: "urgent,high", created_by: "u1"}), scopeProject());
    expect(where.priority).toEqual({in: ["urgent", "high"]});
    expect(where.createdById).toEqual({in: ["u1"]});
  });

  it("filtra por entidade (cliente/órgão)", async () => {
    const where = await applyIssueFilters({}, normalizeFilters({entity_id__in: "e1,e2"}), scopeWorkspace());
    expect(where.entityId).toEqual({in: ["e1", "e2"]});
  });

  it("aplica project apenas quando o where ainda não fixou o projeto", async () => {
    const free = await applyIssueFilters({}, normalizeFilters({project: "p1,p2"}), scopeWorkspace());
    expect(free.projectId).toEqual({in: ["p1", "p2"]});

    const pinned = await applyIssueFilters({projectId}, normalizeFilters({project: "p1"}), scopeProject());
    expect(pinned.projectId).toBe(projectId);
  });

  it("traduz responsáveis e menções em relações `some`", async () => {
    const where = await applyIssueFilters({}, normalizeFilters({assignees: "u1", mentions: "u2"}), scopeProject());
    expect(where.assignees).toEqual({some: {assigneeId: {in: ["u1"]}, deletedAt: null}});
    // IssueMention.mentionId — o nome antigo (`mentionedId`) não existe no schema
    // e fazia o Prisma rejeitar a consulta inteira.
    expect(where.mentions).toEqual({some: {mentionId: {in: ["u2"]}, deletedAt: null}});
  });

  it("gera um where que o Prisma aceita para menções, inscritos, ciclo e módulo", async () => {
    const where = await applyIssueFilters(
      {projectId, deletedAt: null},
      normalizeFilters({
        mention_id__in: "00000000-0000-0000-0000-000000000000",
        subscriber_id__in: "00000000-0000-0000-0000-000000000000",
        cycle_id__in: "00000000-0000-0000-0000-000000000000",
        module_id__in: "00000000-0000-0000-0000-000000000000",
      }),
      scopeProject(),
    );
    expect(where.subscribers).toEqual({
      some: {subscriberId: {in: ["00000000-0000-0000-0000-000000000000"]}, deletedAt: null},
    });
    expect(where.cycleIssues.some.cycleId.in).toHaveLength(1);
    expect(where.moduleIssues.some.moduleId.in).toHaveLength(1);
    // A prova de que o where é válido: o Prisma executa sem erro de argumento.
    expect(await prisma.issue.findMany({where, take: 1})).toEqual([]);
  });

  it("no escopo de projeto usa exatamente os ids de label informados", async () => {
    const label = await createLabel(projectId, workspaceId, {name: "Correção"});
    const where = await applyIssueFilters({}, normalizeFilters({labels: label.id}), scopeProject());
    expect(where.labels.some.labelId.in).toEqual([label.id]);
  });

  it("no escopo de workspace expande labels de mesmo nome em outros projetos", async () => {
    const a = await createLabel(projectId, workspaceId, {name: "Melhoria"});
    const b = await createLabel(otherProjectId, workspaceId, {name: "Melhoria"});
    const where = await applyIssueFilters({}, normalizeFilters({labels: a.id}), scopeWorkspace());
    const ids: string[] = where.labels.some.labelId.in;
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
  });

  it("no escopo de workspace expande estados de mesmo nome em outros projetos", async () => {
    const todoA = await prisma.state.findFirstOrThrow({where: {projectId, name: "Todo"}});
    const todoB = await prisma.state.findFirstOrThrow({where: {projectId: otherProjectId, name: "Todo"}});
    const where = await applyIssueFilters({}, normalizeFilters({state: todoA.id}), scopeWorkspace());
    expect(where.stateId.in).toContain(todoA.id);
    expect(where.stateId.in).toContain(todoB.id);
  });

  it("resolve state_group para ids de estado dentro do escopo", async () => {
    const where = await applyIssueFilters({}, normalizeFilters({state_group: "completed"}), scopeProject());
    const done = await prisma.state.findFirstOrThrow({where: {projectId, group: "completed"}});
    expect(where.stateId.in).toEqual([done.id]);

    const otherDone = await prisma.state.findFirstOrThrow({where: {projectId: otherProjectId, group: "completed"}});
    const wsWhere = await applyIssueFilters({}, normalizeFilters({state_group: "completed"}), scopeWorkspace());
    expect(wsWhere.stateId.in).toContain(done.id);
    expect(wsWhere.stateId.in).toContain(otherDone.id);
  });

  it("une ids explícitos de estado com os resolvidos pelo grupo", async () => {
    const backlog = await prisma.state.findFirstOrThrow({where: {projectId, group: "backlog"}});
    const started = await prisma.state.findFirstOrThrow({where: {projectId, group: "started"}});
    const where = await applyIssueFilters(
      {},
      normalizeFilters({state: backlog.id, state_group: "started"}),
      scopeProject(),
    );
    expect(where.stateId.in.sort()).toEqual([backlog.id, started.id].sort());
  });

  it("grupo sem estado correspondente devolve conjunto vazio (e não a lista toda)", async () => {
    const where = await applyIssueFilters({}, normalizeFilters({state_group: "grupo_inexistente"}), scopeProject());
    expect(where.stateId).toEqual({in: []});

    const byId = await applyIssueFilters(
      {},
      normalizeFilters({state: "00000000-0000-0000-0000-000000000000"}),
      scopeWorkspace(),
    );
    expect(byId.stateId.in).toEqual(["00000000-0000-0000-0000-000000000000"]);
  });

  it("não mexe em stateId quando nenhum filtro de estado foi pedido", async () => {
    const where = await applyIssueFilters({}, normalizeFilters({priority: "low"}), scopeProject());
    expect(where.stateId).toBeUndefined();
  });

  it("interpreta intervalo de datas 'de;até'", async () => {
    const where = await applyIssueFilters(
      {},
      normalizeFilters({target_date: "2026-01-01;2026-01-31"}),
      scopeProject(),
    );
    expect(where.targetDate.gte).toEqual(new Date("2026-01-01"));
    expect(where.targetDate.lte).toEqual(new Date("2026-01-31"));
  });

  it("aceita data única e ignora datas inválidas", async () => {
    const exact = await applyIssueFilters({}, normalizeFilters({start_date: "2026-02-10"}), scopeProject());
    expect(exact.startDate).toEqual(new Date("2026-02-10"));

    const bad = await applyIssueFilters({}, normalizeFilters({start_date: "não-é-data"}), scopeProject());
    expect(bad.startDate).toBeUndefined();

    const halfBad = await applyIssueFilters({}, normalizeFilters({target_date: "xx;2026-03-01"}), scopeProject());
    expect(halfBad.targetDate).toEqual({lte: new Date("2026-03-01")});
  });

  /**
   * O painel de filtros manda as duas bordas do intervalo como entradas
   * separadas ("<data>;after,<data>;before") — `toArray` quebra na vírgula.
   * Lendo só a primeira entrada e tratando o token como se fosse data, o
   * intervalo virava igualdade na data inicial e a listagem voltava vazia.
   */
  describe("intervalo em entradas separadas", () => {
    const alvo = async (valor: string) =>
      (await applyIssueFilters({}, normalizeFilters({target_date: valor}), scopeProject())).targetDate;

    it("monta gte/lte a partir dos tokens after/before", async () => {
      expect(await alvo("2026-01-01;after,2026-01-31;before")).toEqual({
        gte: new Date("2026-01-01"),
        lte: new Date("2026-01-31"),
      });
    });

    it("aceita apenas o limite inferior", async () => {
      expect(await alvo("2026-01-01;after")).toEqual({gte: new Date("2026-01-01")});
    });

    it("aceita apenas o limite superior", async () => {
      expect(await alvo("2026-01-31;before")).toEqual({lte: new Date("2026-01-31")});
    });

    it("reconhece os apelidos from/to e gte/lte", async () => {
      expect(await alvo("2026-04-01;from,2026-04-30;to")).toEqual({
        gte: new Date("2026-04-01"),
        lte: new Date("2026-04-30"),
      });
      expect(await alvo("2026-05-01;GTE,2026-05-31;LTE")).toEqual({
        gte: new Date("2026-05-01"),
        lte: new Date("2026-05-31"),
      });
    });

    it("duas datas sem token também formam intervalo, na ordem certa", async () => {
      expect(await alvo("2026-06-30,2026-06-01")).toEqual({
        gte: new Date("2026-06-01"),
        lte: new Date("2026-06-30"),
      });
    });

    it("uma data com token desconhecido continua sendo igualdade", async () => {
      expect(await alvo("2026-07-15;seila")).toEqual(new Date("2026-07-15"));
    });
  });

  it("um where sem filtros permanece intocado", async () => {
    const where = await applyIssueFilters({projectId}, normalizeFilters({page: "2"}), scopeProject());
    expect(where).toEqual({projectId});
  });

  it("combina vários filtros no mesmo where", async () => {
    const label = await createLabel(projectId, workspaceId, {name: "Projeto"});
    const where = await applyIssueFilters(
      {projectId},
      normalizeFilters({
        filters: JSON.stringify({
          and: [{priority__in: "urgent"}, {state_group__in: "started"}, {labels__in: label.id}],
        }),
        assignees: "u1",
      }),
      scopeProject(),
    );
    expect(where.priority).toEqual({in: ["urgent"]});
    expect(where.stateId.in.length).toBeGreaterThan(0);
    expect(where.labels.some.labelId.in).toContain(label.id);
    expect(where.assignees.some.assigneeId.in).toEqual(["u1"]);
    expect(where.projectId).toBe(projectId);
  });
});
