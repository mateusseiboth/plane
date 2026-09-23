/**
 * Painel da página inicial: série de abertos x encerrados por período, tarefas
 * com prazo, métricas do mês com o ranking de encerrados, chamados por sistema
 * e os detalhes da pessoa. Tudo do usuário logado (responsável ou criador).
 * API de verdade + banco de teste.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  addAssignee,
  addMember,
  apiClient,
  createApiToken,
  createEntity,
  createIssue,
  createProject,
  createUser,
  createWorkspace,
  projectStates,
  TEST_API_BASE_URL,
} from "@tests/helpers/factory";
import { prismaReal } from "@tests/helpers/prisma-real";
import { cleanDb } from "@tests/helpers/setup";

const HORA_MS = 3_600_000;
const DIA_MS = 24 * HORA_MS;

const soma = (dias: any[], campo: "abertos" | "encerrados") => dias.reduce((t, d) => t + d[campo], 0);

describe("painel da home: série, tarefas, métricas, sistemas e perfil", () => {
  let ana: ReturnType<typeof apiClient>;
  let slug: string;
  let anaId: string;
  let tributos: string;
  let concluidoTributos: string;
  let tarefaDeAmanha: string;
  let tarefaAtrasada: string;
  const ultimoLogin = new Date("2026-09-20T12:30:00.000Z");

  beforeAll(async () => {
    await cleanDb();
    const db = prismaReal();
    const agora = Date.now();

    const dona = await createUser({ firstName: "Ana", lastName: "Atendente", email: "ana@painel.test" });
    anaId = dona.id;
    ana = apiClient((await createApiToken(dona.id)).token);
    const ws = await createWorkspace(dona.id);
    slug = ws.slug;
    await db.workspaceMember.updateMany({
      where: { workspaceId: ws.id, memberId: anaId },
      data: { companyRole: "Suporte" },
    });

    const p1 = await createProject(ws.id, anaId, { name: "Tributos", identifier: "TRIB" });
    const p2 = await createProject(ws.id, anaId, { name: "Folha", identifier: "FOLHA" });
    tributos = p1.id;
    const estados1 = await projectStates(p1.id);
    const estados2 = await projectStates(p2.id);
    const todo1 = (estados1.byName.get("Todo") as { id: string }).id;
    const done1 = (estados1.byName.get("Done") as { id: string }).id;
    const todo2 = (estados2.byName.get("Todo") as { id: string }).id;
    const done2 = (estados2.byName.get("Done") as { id: string }).id;
    concluidoTributos = done1;

    const bia = await createUser({ firstName: "Bia" });
    const caio = await createUser({ firstName: "Caio" });
    await addMember(ws.id, bia.id, 15, p1.id, 15);
    await addMember(ws.id, caio.id, 15, p1.id, 15);

    const prefeitura = await createEntity(ws.id, { name: "Prefeitura de Dourados" });

    const criar = async (
      projectId: string,
      stateId: string,
      dono: string,
      opcoes: { criadoHa?: number; encerradoHa?: number; prazoEm?: number; nome?: string; prioridade?: string } = {}
    ) => {
      const issue = await createIssue(projectId, ws.id, {
        name: opcoes.nome ?? "Chamado",
        stateId,
        priority: opcoes.prioridade ?? "medium",
        entityId: prefeitura.id,
        ...(opcoes.prazoEm !== undefined ? { targetDate: new Date(agora + opcoes.prazoEm) } : {}),
      });
      await db.issue.update({
        where: { id: issue.id },
        data: {
          createdAt: new Date(agora - (opcoes.criadoHa ?? 0)),
          ...(opcoes.encerradoHa !== undefined ? { completedAt: new Date(agora - opcoes.encerradoHa) } : {}),
        },
      });
      await addAssignee(issue.id, dono, projectId, ws.id);
      return issue.id;
    };

    // Da Ana: 2 abertos hoje (um com prazo amanhã, outro sem prazo), 1 aberto há
    // 2 dias e encerrado agora, 1 atrasado aberto há 3 dias, 1 antigo encerrado
    // há 40 dias e 1 na Folha aberto ontem.
    tarefaDeAmanha = await criar(tributos, todo1, anaId, { prazoEm: DIA_MS, nome: "Guia do ISS", prioridade: "high" });
    await criar(tributos, todo1, anaId, { nome: "Sem prazo" });
    await criar(tributos, done1, anaId, { criadoHa: 2 * DIA_MS, encerradoHa: 60_000, nome: "Encerrado agora" });
    tarefaAtrasada = await criar(tributos, todo1, anaId, {
      criadoHa: 3 * DIA_MS,
      prazoEm: -2 * DIA_MS,
      nome: "Atrasado",
    });
    await criar(tributos, done1, anaId, { criadoHa: 45 * DIA_MS, encerradoHa: 40 * DIA_MS, nome: "Antigo" });
    await criar(p2.id, todo2, anaId, { criadoHa: DIA_MS, prazoEm: 5 * DIA_MS, nome: "Folha de setembro" });
    // Criado pela Ana, sem responsável: conta na série (criadora), não nas tarefas.
    const criadoPelaAna = await createIssue(p2.id, ws.id, {
      name: "Aberto pela Ana",
      stateId: done2,
      createdById: anaId,
    });
    await db.issue.update({ where: { id: criadoPelaAna.id }, data: { completedAt: new Date(agora - 30_000) } });

    // Dos outros: Bia encerrou 3 no mês, Caio 1. Não entram na série da Ana.
    await Promise.all([1, 2, 3].map(() => criar(tributos, done1, bia.id, { encerradoHa: HORA_MS })));
    await criar(tributos, done1, caio.id, { encerradoHa: HORA_MS });

    await db.auditLog.create({
      data: {
        workspaceId: ws.id,
        actorId: anaId,
        entity: "user",
        entityId: anaId,
        action: "login",
        createdAt: ultimoLogin,
      },
    });
  });

  afterAll(() => cleanDb());

  const getJson = async (path: string) => {
    const res = await ana.get(`/workspaces/${slug}/home/${path}`);
    return { status: res.status, body: (await res.json()) as any };
  };

  it("sem sessão as rotas do painel respondem 401", async () => {
    const rotas = [
      "serie-de-chamados/",
      "tarefas/",
      "metricas-do-mes/",
      "chamados-por-sistema/",
      "perfil/",
      "atividade/",
    ];
    const respostas = await Promise.all(
      rotas.map((r) => fetch(`${TEST_API_BASE_URL}/api/v1/workspaces/${slug}/home/${r}`))
    );
    expect(respostas.map((r) => r.status)).toEqual(rotas.map(() => 401));
  });

  it("a série da semana tem 7 dias, abertos e encerrados da pessoa, sem os dos outros", async () => {
    const { status, body } = await getJson("serie-de-chamados/?periodo=semana");
    expect(status).toBe(200);
    expect(body.periodo).toBe("semana");
    expect(body.dias).toHaveLength(7);
    expect(Object.keys(body.dias[0]).toSorted()).toEqual(["abertos", "data", "encerrados"]);
    // Abertos na semana: 2 hoje, 1 há 2 dias, 1 há 3 dias, 1 ontem, 1 criado por ela hoje.
    expect(soma(body.dias, "abertos")).toBe(6);
    // Encerrados na semana: o de agora e o que ela criou.
    expect(soma(body.dias, "encerrados")).toBe(2);
    expect(body.total_abertos).toBe(6);
    expect(body.total_encerrados).toBe(2);
  });

  it("o trimestre alcança o chamado antigo e o período inválido cai na semana", async () => {
    const trimestre = await getJson("serie-de-chamados/?periodo=trimestre");
    expect(trimestre.body.dias).toHaveLength(90);
    expect(soma(trimestre.body.dias, "abertos")).toBe(7);
    expect(soma(trimestre.body.dias, "encerrados")).toBe(3);

    const mes = await getJson("serie-de-chamados/?periodo=mes");
    expect(mes.body.dias).toHaveLength(30);

    const invalido = await getJson("serie-de-chamados/?periodo=decada");
    expect(invalido.body.periodo).toBe("semana");
  });

  it("tarefas: só os abertos com prazo, do prazo mais próximo, com sistema, entidade e etapa de conclusão", async () => {
    const { status, body } = await getJson("tarefas/");
    expect(status).toBe(200);
    expect(body.map((t: any) => t.name)).toEqual(["Atrasado", "Guia do ISS", "Folha de setembro"]);
    const amanha = body.find((t: any) => t.id === tarefaDeAmanha);
    expect(amanha).toMatchObject({
      project_id: tributos,
      project_name: "Tributos",
      project_identifier: "TRIB",
      entity_name: "Prefeitura de Dourados",
      priority: "high",
      completed_state_id: concluidoTributos,
    });
    expect(amanha.numero).toMatch(/^\d+-\d{4}$/);
    expect(typeof amanha.target_date).toBe("string");
    expect(body.find((t: any) => t.id === tarefaAtrasada)).toBeDefined();
  });

  it("métricas do mês: encerrados, em aberto, tempo médio e posição no ranking", async () => {
    const { status, body } = await getJson("metricas-do-mes/");
    expect(status).toBe(200);
    // Bia 3, Ana 1, Caio 1: Ana divide a 2ª posição com o Caio.
    expect(body.encerrados).toBe(1);
    expect(body.em_aberto).toBe(4);
    expect(body.ranking).toEqual({ posicao: 2, total_pessoas: 3 });
    // O encerrado do mês foi aberto há 2 dias.
    expect(body.tempo_medio_resolucao_horas).toBeGreaterThan(47);
    expect(body.tempo_medio_resolucao_horas).toBeLessThan(49);
  });

  it("chamados por sistema: abertos no período, do sistema com mais chamados para o com menos", async () => {
    const { status, body } = await getJson("chamados-por-sistema/?periodo=semana");
    expect(status).toBe(200);
    expect(body.periodo).toBe("semana");
    expect(body.sistemas).toEqual([
      expect.objectContaining({ project_name: "Tributos", project_identifier: "TRIB", total: 4 }),
      expect.objectContaining({ project_name: "Folha", project_identifier: "FOLHA", total: 2 }),
    ]);
  });

  it("perfil: nome, papel, equipe, entrada no espaço, sistemas, e-mail e último acesso", async () => {
    const { status, body } = await getJson("perfil/");
    expect(status).toBe(200);
    expect(body).toMatchObject({
      id: anaId,
      nome: "Ana Atendente",
      email: "ana@painel.test",
      equipe: "Suporte",
      ultimo_acesso: ultimoLogin.toISOString(),
      gestor: null,
    });
    expect(typeof body.papel).toBe("string");
    expect(body.papel.length).toBeGreaterThan(0);
    expect(typeof body.entrou_em).toBe("string");
    expect(body.sistemas.map((s: any) => s.name).toSorted()).toEqual(["Folha", "Tributos"]);
  });
});
