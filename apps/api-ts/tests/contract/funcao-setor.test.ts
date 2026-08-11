/**
 * A função do setor precisa valer no quadro.
 *
 * As transições são avaliadas pela função do PROJETO, mas quem administra mexe
 * na do espaço de trabalho (Configurações → Membros). Sem propagar de uma para
 * a outra, marcar alguém como TI mudava só o rótulo na tela: no vínculo de
 * projeto a função antiga continuava valendo. Foi assim que, numa apresentação,
 * um usuário de TI concluiu um chamado e ainda o devolveu para a Triagem.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { cleanDb } from "@tests/helpers/setup";
import { apiClient, createApiToken, createProject, createUser, createWorkspace } from "@tests/helpers/factory";

const TI = 12;
const GESTOR_DE_PROJETO = 18;

describe("TestFuncaoDeSetorNoQuadro", () => {
  let admin: ReturnType<typeof apiClient>;
  let tecnico: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let wsId: string;
  let projectId: string;
  let tecnicoId: string;
  const estados: Record<string, string> = {};

  const criarEstado = async (nome: string, group: string, sequence: number) => {
    const s = await prisma.state.create({
      data: { name: nome, slug: nome.toLowerCase().replace(/\s+/g, "-"), group, projectId, workspaceId: wsId, sequence },
    });
    estados[nome] = s.id;
    return s;
  };

  const moverPara = (issueId: string, nome: string) =>
    tecnico.patch(`/workspaces/${wsSlug}/projects/${projectId}/issues/${issueId}/`, { state_id: estados[nome] });

  const criarChamado = async (sequencia: number, estado: string) =>
    prisma.issue.create({
      data: { projectId, workspaceId: wsId, name: `Chamado ${sequencia}`, sequenceId: sequencia, stateId: estados[estado] },
    });

  beforeAll(async () => {
    await cleanDb();
    const dono = await createUser({ email: "gestor-setor@plane.test" });
    const ws = await createWorkspace(dono.id);
    wsSlug = ws.slug;
    wsId = ws.id;
    admin = apiClient((await createApiToken(dono.id)).token);
    projectId = (await createProject(ws.id, dono.id)).id;

    await criarEstado("Triagem", "triage", 1);
    await criarEstado("Em Análise", "started", 2);
    await criarEstado("A Fazer", "unstarted", 3);
    await criarEstado("Em Desenvolvimento", "started", 4);
    await criarEstado("Em Teste", "started", 5);
    await criarEstado("Concluído", "completed", 6);

    // O cenário da apresentação: pessoa do TI cujo vínculo de projeto ficou com
    // uma função mais alta, herdada da importação.
    const dev = await createUser({ email: "leandro-teste@plane.test" });
    tecnicoId = dev.id;
    await prisma.workspaceMember.create({ data: { workspaceId: wsId, memberId: dev.id, role: TI, isActive: true } });
    await prisma.projectMember.create({
      data: { projectId, workspaceId: wsId, memberId: dev.id, role: GESTOR_DE_PROJETO, isActive: true },
    });
    tecnico = apiClient((await createApiToken(dev.id)).token);
  });

  afterAll(() => cleanDb());

  it("mudar a função no espaço de trabalho reescreve a função nos projetos", async () => {
    const antes = await prisma.projectMember.findFirst({ where: { projectId, memberId: tecnicoId } });
    expect(antes?.role).toBe(GESTOR_DE_PROJETO);

    const res = await admin.patch(`/workspaces/${wsSlug}/members/${tecnicoId}/`, { role: TI });
    expect(res.status).toBe(200);

    const depois = await prisma.projectMember.findFirst({ where: { projectId, memberId: tecnicoId } });
    expect(depois?.role).toBe(TI);
  });

  it("TI leva de A Fazer até Em Teste", async () => {
    const chamado = await criarChamado(201, "A Fazer");
    expect((await moverPara(chamado.id, "Em Desenvolvimento")).status).toBe(200);
    expect((await moverPara(chamado.id, "Em Teste")).status).toBe(200);
  });

  it("TI não conclui: fechar é da Qualidade", async () => {
    const chamado = await criarChamado(202, "Em Teste");
    expect((await moverPara(chamado.id, "Concluído")).status).toBe(403);

    const atual = await prisma.issue.findUnique({ where: { id: chamado.id } });
    expect(atual?.stateId).toBe(estados["Em Teste"]);
  });

  it("TI não devolve para a Triagem nem para Em Análise", async () => {
    const chamado = await criarChamado(203, "Em Desenvolvimento");
    expect((await moverPara(chamado.id, "Triagem")).status).toBe(403);
    expect((await moverPara(chamado.id, "Em Análise")).status).toBe(403);

    const atual = await prisma.issue.findUnique({ where: { id: chamado.id } });
    expect(atual?.stateId).toBe(estados["Em Desenvolvimento"]);
  });
});

/**
 * Quem foi desligado sai das listas de escolher responsável.
 *
 * A associação continua no banco de propósito — sem ela o histórico perde o
 * autor —, mas a pessoa não pode mais aparecer como opção de responsável.
 */
describe("TestMembrosInativosNasListagens", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let projectId: string;
  let desligadoId: string;

  beforeAll(async () => {
    await cleanDb();
    const dono = await createUser({ email: "dono-listagem@plane.test" });
    const ws = await createWorkspace(dono.id);
    wsSlug = ws.slug;
    client = apiClient((await createApiToken(dono.id)).token);
    projectId = (await createProject(ws.id, dono.id)).id;

    const desligado = await createUser({ email: "desligado@plane.test", displayName: "Fulano Desligado" });
    desligadoId = desligado.id;
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, memberId: desligado.id, role: 12, isActive: true } });
    await prisma.projectMember.create({
      data: { projectId, workspaceId: ws.id, memberId: desligado.id, role: 12, isActive: true },
    });
    await prisma.user.update({ where: { id: desligado.id }, data: { isActive: false } });
  });

  afterAll(() => cleanDb());

  const ids = async (url: string) => {
    const res = await client.get(url);
    expect(res.status).toBe(200);
    const dados = (await res.json()) as any;
    return (Array.isArray(dados) ? dados : (dados.results ?? [])).map((m: any) => m.member ?? m.member_id ?? m.id);
  };

  it("membros do espaço de trabalho não trazem quem foi desligado", async () => {
    expect(await ids(`/workspaces/${wsSlug}/members/`)).not.toContain(desligadoId);
  });

  it("membros do sistema não trazem quem foi desligado", async () => {
    expect(await ids(`/workspaces/${wsSlug}/projects/${projectId}/members/`)).not.toContain(desligadoId);
  });

  it("a associação continua no banco, para o histórico não perder o autor", async () => {
    const vinculo = await prisma.projectMember.findFirst({ where: { projectId, memberId: desligadoId } });
    expect(vinculo).not.toBeNull();
    expect(vinculo?.isActive).toBe(true);
  });
});
