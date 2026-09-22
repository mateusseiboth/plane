/**
 * Relatórios de chamados sobre os marcos por etapa: analítico por usuário,
 * devolvidos, sintético semanal, balanço, visão por sistema × tipo, tendência com
 * período livre, visitas por UF e sistema, log consolidado, horas analíticas e o
 * painel de TV. Todos exigem `report.view`. API de verdade + banco de teste.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  addAssignee,
  addLabelToIssue,
  apiClient,
  createApiToken,
  createEntity,
  createIssue,
  createLabel,
  createMemberWithToken,
  createProject,
  createState,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";
import { prismaReal } from "@tests/helpers/prisma-real";
import { cleanDb } from "@tests/helpers/setup";
import { DEFAULT_STATES } from "@utils/project-defaults";
import { STATE } from "@utils/permissions";

const dia = (d: number, h = 12) => new Date(Date.UTC(2026, 8, d, h));
const PERIODO_SET = "date_from=2026-09-01T03:00:00.000Z&date_to=2026-10-01T02:59:59.999Z";

describe("relatórios de chamados (marcos por etapa)", () => {
  let admin: ReturnType<typeof apiClient>;
  let ti: ReturnType<typeof apiClient>;
  let slug: string;
  let p1: string;
  let p2: string;
  let devId: string;
  let qldId: string;
  const chamado: Record<string, string> = {};

  beforeAll(async () => {
    await cleanDb();
    const db = prismaReal();
    const owner = await createUser({ firstName: "Ana", lastName: "Admin" });
    admin = apiClient((await createApiToken(owner.id)).token);
    const ws = await createWorkspace(owner.id);
    slug = ws.slug;

    const projeto = await createProject(ws.id, owner.id, { name: "Tributos", identifier: "TRIB" });
    const outro = await createProject(ws.id, owner.id, { name: "Folha", identifier: "FOLHA" });
    p1 = projeto.id;
    p2 = outro.id;

    const etapas: Record<string, string> = {};
    for (const s of DEFAULT_STATES) {
      etapas[s.name] = (await createState(p1, ws.id, { name: s.name, group: s.group, sequence: s.sequence })).id;
    }
    const aFazerP2 = await createState(p2, ws.id, { name: STATE.A_FAZER, group: "unstarted" });

    const dev = await createMemberWithToken(ws.id, 12, p1, 12);
    const qld = await createMemberWithToken(ws.id, 8, p1, 8);
    await db.user.update({ where: { id: dev.user.id }, data: { firstName: "Davi", lastName: "Dev" } });
    await db.user.update({ where: { id: qld.user.id }, data: { firstName: "Quitéria", lastName: "Qualidade" } });
    devId = dev.user.id;
    qldId = qld.user.id;
    ti = apiClient(dev.token);

    const correcao = await createLabel(p1, ws.id, { name: "Correção" });
    const melhoria = await createLabel(p1, ws.id, { name: "Melhoria" });
    const ms = await createEntity(ws.id, { name: "Prefeitura de Campo Grande", city: "Campo Grande", state: "MS" });
    const mt = await createEntity(ws.id, { name: "Prefeitura de Cuiabá", city: "Cuiabá", state: "MT" });

    const criar = async (nome: string, etapa: string, criadoEm: Date, over: Record<string, unknown> = {}) => {
      const issue = await createIssue(p1, ws.id, { name: nome, stateId: etapas[etapa], entityId: ms.id, ...over });
      await db.issue.update({ where: { id: issue.id }, data: { createdAt: criadoEm } });
      return issue.id;
    };
    const transicao = (issueId: string, de: string, para: string, em: Date, por: string) =>
      db.issueActivity.create({
        data: {
          issueId,
          workspaceId: ws.id,
          projectId: p1,
          actorId: por,
          verb: "updated",
          field: "state",
          oldValue: de,
          newValue: para,
          createdAt: em,
        },
      });
    const atribuir = async (issueId: string, userId: string, em: Date) => {
      const a = await addAssignee(issueId, userId, p1, ws.id);
      await db.issueAssignee.update({ where: { id: a.id }, data: { createdAt: em } });
    };

    // A: correção que foi devolvida uma vez e homologada.
    chamado.a = await criar("Erro no cálculo do IPTU", STATE.CONCLUIDO, dia(1));
    await addLabelToIssue(chamado.a, correcao.id, p1, ws.id);
    await atribuir(chamado.a, devId, dia(2));
    await transicao(chamado.a, STATE.A_FAZER, STATE.EM_DESENVOLVIMENTO, dia(3), devId);
    await transicao(chamado.a, STATE.EM_DESENVOLVIMENTO, STATE.EM_TESTE, dia(5), devId);
    await transicao(chamado.a, STATE.EM_TESTE, STATE.EM_DESENVOLVIMENTO, dia(6), qldId);
    await transicao(chamado.a, STATE.EM_DESENVOLVIMENTO, STATE.EM_TESTE, dia(8), devId);
    await transicao(chamado.a, STATE.EM_TESTE, STATE.CONCLUIDO, dia(10), qldId);

    // B: melhoria urgente parada em A Fazer.
    chamado.b = await criar("Nova guia de recolhimento", STATE.A_FAZER, dia(9), { priority: "urgent" });
    await addLabelToIssue(chamado.b, melhoria.id, p1, ws.id);

    // C: sem tipo, em desenvolvimento com o dev.
    chamado.c = await criar("Ajuste de layout", STATE.EM_DESENVOLVIMENTO, dia(9));
    await atribuir(chamado.c, devId, dia(9));
    await transicao(chamado.c, STATE.A_FAZER, STATE.EM_DESENVOLVIMENTO, dia(9, 15), devId);

    // D: outro sistema, aberto em 2024 (fora da janela fixa antiga de 12 meses).
    const d = await createIssue(p2, ws.id, { name: "Antigo", stateId: aFazerP2.id });
    await db.issue.update({ where: { id: d.id }, data: { createdAt: new Date(Date.UTC(2024, 2, 15, 12)) } });

    await db.issueComment.createMany({
      data: [
        {
          issueId: chamado.a,
          workspaceId: ws.id,
          projectId: p1,
          actorId: devId,
          commentHtml: "<p>ok</p>",
          commentStripped: "ok",
          createdAt: dia(9),
        },
        {
          issueId: chamado.c,
          workspaceId: ws.id,
          projectId: p1,
          actorId: devId,
          commentHtml: "<p>feito</p>",
          commentStripped: "feito",
          createdAt: dia(10),
        },
      ],
    });

    await db.issueTimeLog.createMany({
      data: [
        {
          issueId: chamado.c,
          workspaceId: ws.id,
          projectId: p1,
          memberId: devId,
          durationMinutes: 30,
          loggedDate: dia(9),
          description: "layout",
        },
        {
          issueId: chamado.a,
          workspaceId: ws.id,
          projectId: p1,
          memberId: devId,
          durationMinutes: 60,
          loggedDate: dia(5),
          description: "cálculo",
        },
      ],
    });

    await db.technicalVisit.createMany({
      data: [
        {
          workspaceId: ws.id,
          entityId: ms.id,
          city: "Campo Grande",
          status: 4,
          scheduledDate: dia(4),
          projectIds: [p1],
        },
        { workspaceId: ws.id, entityId: mt.id, city: "Cuiabá", status: 0, scheduledDate: dia(4), projectIds: [] },
      ],
    });
  });

  afterAll(() => cleanDb());

  const getJson = async (path: string, client = admin) => {
    const res = await client.get(`/workspaces/${slug}/reports/${path}`);
    return { status: res.status, body: (await res.json()) as any };
  };

  it("sem report.view a função recebe 403", async () => {
    for (const rota of [
      "milestones-by-user/",
      "returned/",
      "weekly-summary/",
      "balance/",
      "ticket-log/",
      "tv-panel/?setor=ti",
    ]) {
      expect((await getJson(rota, ti)).status).toBe(403);
    }
  });

  it("analítico por usuário traz os marcos e o número anual", async () => {
    const { status, body } = await getJson(`milestones-by-user/?user_id=${devId}&${PERIODO_SET}`);
    expect(status).toBe(200);
    const dev = body.usuarios.find((u: any) => u.user_id === devId);
    expect(dev.name).toBe("Davi Dev");
    const a = dev.chamados.find((c: any) => c.id === chamado.a);
    expect(a.ticket_number).toMatch(/^\d+-\d{4}$/);
    expect(a.identifier).toMatch(/^TRIB-/);
    expect(a.tipo).toBe("correcao");
    expect(a.marcos).toMatchObject({
      atribuido_em: dia(2).toISOString(),
      inicio_ti_em: dia(3).toISOString(),
      finalizado_ti_em: dia(8).toISOString(),
      homologado_em: dia(10).toISOString(),
      homologado_por: "Quitéria Qualidade",
      encerrado_em: dia(10).toISOString(),
      devolucoes: 1,
    });
    expect(dev.chamados.map((c: any) => c.id).sort()).toEqual([chamado.a, chamado.c].sort());
  });

  it("analítico por quem homologou (visão da Qualidade)", async () => {
    const { body } = await getJson(`milestones-by-user/?perfil=homologacao&${PERIODO_SET}`);
    expect(body.usuarios.map((u: any) => [u.user_id, u.chamados.map((c: any) => c.id)])).toEqual([
      [qldId, [chamado.a]],
    ]);
  });

  it("situação abertos esconde o encerrado", async () => {
    const { body } = await getJson(`milestones-by-user/?user_id=${devId}&situacao=abertos`);
    expect(body.usuarios[0].chamados.map((c: any) => c.id)).toEqual([chamado.c]);
  });

  it("devolvidos no período, com quem devolveu", async () => {
    const { status, body } = await getJson(`returned/?${PERIODO_SET}`);
    expect(status).toBe(200);
    expect(body.kpis).toEqual({ chamados: 1, devolucoes: 1 });
    expect(body.rows[0].id).toBe(chamado.a);
    expect(body.rows[0].devolucoes[0]).toMatchObject({ em: dia(6).toISOString(), por: "Quitéria Qualidade" });
  });

  it("sintético semanal: responsável × sistema × tipo", async () => {
    const { status, body } = await getJson(
      "weekly-summary/?date_from=2026-09-07T03:00:00.000Z&date_to=2026-09-14T02:59:59.999Z"
    );
    expect(status).toBe(200);
    const dev = body.usuarios.find((u: any) => u.user_id === devId);
    const trib = dev.sistemas.find((s: any) => s.project_id === p1);
    expect(trib.name).toBe("Tributos");
    expect(trib.concluidos).toMatchObject({ correcao: 1, total: 1 });
    expect(trib.pendentes).toMatchObject({ outros: 1, total: 1 });
    expect(trib.interacoes).toBe(2);
    expect(body.tipos.map((t: any) => t.label)).toEqual(["Correção", "Melhoria", "Projeto", "Outros"]);
  });

  it("balanço mensal do sistema, com saldo", async () => {
    const { status, body } = await getJson(`balance/?granularidade=mes&project_ids=${p1}&${PERIODO_SET}`);
    expect(status).toBe(200);
    expect(body.linhas).toHaveLength(1);
    expect(body.linhas[0]).toMatchObject({
      periodo: "2026-09",
      saldo_anterior: 0,
      abertos: 3,
      encerrados: 1,
      saldo_atual: 2,
    });
  });

  it("balanço aceita vários sistemas no filtro", async () => {
    const { body } = await getJson(
      `balance/?granularidade=ano&project_ids=${p1},${p2}&date_from=2024-01-01T03:00:00.000Z&date_to=2026-12-31T12:00:00.000Z`
    );
    expect(body.linhas.map((l: any) => [l.periodo, l.abertos, l.saldo_atual])).toEqual([
      ["2024", 1, 1],
      ["2025", 0, 1],
      ["2026", 3, 3],
    ]);
  });

  it("balanço recusa granularidade desconhecida", async () => {
    expect((await getJson("balance/?granularidade=semana")).status).toBe(400);
  });

  it("por sistema: pendente, em andamento, a homologar e concluído, cruzado com tipo", async () => {
    const { body } = await getJson("by-system/");
    const trib = body.rows.find((r: any) => r.project_id === p1);
    expect(trib.situacoes).toMatchObject({ pendente: 1, em_andamento: 1, a_homologar: 0, concluido: 1 });
    expect(trib.por_tipo.correcao).toMatchObject({ total: 1, concluido: 1 });
    expect(trib.por_tipo.melhoria).toMatchObject({ total: 1, pendente: 1 });
  });

  it("por tipo traz a matriz sistema × tipo", async () => {
    const { body } = await getJson("by-type/");
    const trib = body.by_system.find((r: any) => r.project_id === p1);
    expect(trib).toMatchObject({ name: "Tributos", correcao: 1, melhoria: 1, projeto: 0, outros: 1, total: 3 });
  });

  it("tendência respeita o período pedido", async () => {
    const { body } = await getJson("trends/?date_from=2024-03-01T03:00:00.000Z&date_to=2024-04-01T02:59:59.999Z");
    expect(body.series).toEqual([{ month: "2024-03", created: 1, completed: 0, net: 1 }]);
  });

  it("visitas: filtro por UF e contagem por sistema", async () => {
    const { body } = await getJson("visits-overview/?uf=MS");
    expect(body.kpis.total).toBe(1);
    expect(body.by_system).toEqual([{ project_id: p1, name: "Tributos", count: 1 }]);
    expect((await getJson("visits-overview/?city=cuiaba")).body.kpis.total).toBe(1);
  });

  it("log consolidado filtra por função e etapa", async () => {
    const { status, body } = await getJson(`ticket-log/?funcao=qualidade&project_ids=${p1}&${PERIODO_SET}`);
    expect(status).toBe(200);
    expect(body.rows.map((r: any) => [r.usuario.name, r.funcao?.nome, r.acao, r.para])).toEqual([
      ["Quitéria Qualidade", "Qualidade", "Mudou a etapa", STATE.CONCLUIDO],
      ["Quitéria Qualidade", "Qualidade", "Mudou a etapa", STATE.EM_DESENVOLVIMENTO],
    ]);
    // Opções dos filtros de etapa e função vêm junto, para a tela não repetir a lista.
    expect(body.etapas).toContain(STATE.EM_TESTE);
    expect(body.funcoes.map((f: any) => f.key)).toContain("qualidade");
    const etapa = await getJson(`ticket-log/?etapa=${encodeURIComponent(STATE.EM_DESENVOLVIMENTO)}`);
    expect(new Set(etapa.body.rows.map((r: any) => r.chamado.id))).toEqual(new Set([chamado.c]));
    expect(etapa.body.rows.some((r: any) => r.tipo === "comentario")).toBe(true);
  });

  it("horas analíticas por analista, com os lançamentos", async () => {
    const { body } = await getJson(`time-tracking/?${PERIODO_SET}`);
    const dev = body.by_analyst.find((a: any) => a.user_id === devId);
    expect(dev).toMatchObject({ name: "Davi Dev", minutes: 90, hours: 1.5 });
    expect(dev.entries.map((e: any) => [e.minutes, e.description, e.issue.id])).toEqual([
      [60, "cálculo", chamado.a],
      [30, "layout", chamado.c],
    ]);
    expect(dev.entries[0].issue.ticket_number).toMatch(/^\d+-\d{4}$/);
  });

  it("painel de TV do TI: colunas, pessoas e alerta de urgente", async () => {
    const { status, body } = await getJson(`tv-panel/?setor=ti&project_ids=${p1}`);
    expect(status).toBe(200);
    expect(body.colunas.map((c: any) => [c.chave, c.chamados.map((x: any) => x.id)])).toEqual([
      ["a_fazer", [chamado.b]],
      ["em_desenvolvimento", [chamado.c]],
      ["em_teste", []],
    ]);
    expect(body.alertas.map((c: any) => c.id)).toEqual([chamado.b]);
    expect(body.por_pessoa.map((p: any) => [p.name, p.chamados.map((x: any) => x.id)])).toEqual([
      ["Davi Dev", [chamado.c]],
    ]);
  });

  it("painel de TV recusa setor desconhecido", async () => {
    expect((await getJson("tv-panel/?setor=financeiro")).status).toBe(400);
  });

  it("tempo em cada etapa continua lendo o histórico", async () => {
    const { body } = await getJson(`time-in-state/?project_ids=${p1}`);
    expect(body.by_state.map((s: any) => s.state_name)).toContain(STATE.EM_TESTE);
  });
});
