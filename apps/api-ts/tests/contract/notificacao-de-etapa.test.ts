/**
 * Avisar quem tem de agir quando o chamado muda de etapa.
 *
 * O quadro só conta a história para quem está olhando: o TI mandava para Em
 * Teste e a Qualidade não ficava sabendo; a Qualidade devolvia com erro e o
 * desenvolvedor descobria por acaso. Estes testes fixam os dois sentidos.
 *
 * O setor dono de cada etapa vem das transições configuradas em Funções — dono
 * é quem pode SAIR dela —, então o fixture cria as mesmas regras da operação.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { cleanDb } from "@tests/helpers/setup";
import { apiClient, createApiToken, createProject, createUser, createWorkspace } from "@tests/helpers/factory";
import { defaultRoleForLevel } from "@utils/permissions";

const TI = 12;
const QUALIDADE = 8;

describe("TestNotificacaoDeMudancaDeEtapa", () => {
  let devClient: ReturnType<typeof apiClient>;
  let qaClient: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let wsId: string;
  let projectId: string;
  let devId: string;
  let qaId: string;
  let qaSemChamadoId: string;
  const estados: Record<string, string> = {};

  const criarEstado = async (nome: string, group: string, sequence: number) => {
    const s = await prisma.state.create({
      data: { name: nome, slug: nome.toLowerCase().replace(/\s+/g, "-"), group, projectId, workspaceId: wsId, sequence },
    });
    estados[nome] = s.id;
  };

  const mover = (cliente: ReturnType<typeof apiClient>, issueId: string, nome: string) =>
    cliente.patch(`/workspaces/${wsSlug}/projects/${projectId}/issues/${issueId}/`, { state_id: estados[nome] });

  const avisosSobre = (issueId: string) =>
    prisma.notification.findMany({ where: { issueId, triggered: "state" }, select: { receiverId: true, title: true } });

  beforeAll(async () => {
    await cleanDb();
    const dono = await createUser({ email: "dono-notif@plane.test" });
    const ws = await createWorkspace(dono.id);
    wsSlug = ws.slug;
    wsId = ws.id;
    projectId = (await createProject(ws.id, dono.id)).id;

    await criarEstado("Em Desenvolvimento", "started", 1);
    await criarEstado("Em Teste", "started", 2);

    const papeis: Record<string, string> = {};
    for (const [key, level] of [
      ["ti", TI],
      ["qualidade", QUALIDADE],
    ] as const) {
      // Permissões reais do papel: com a lista vazia o PATCH nem chega à
      // checagem de transição — para em 403 por falta de permissão de editar.
      const r = await prisma.workflowRole.create({
        data: { workspaceId: wsId, key, name: key, level, permissions: defaultRoleForLevel(level).permissions, isSystem: true },
      });
      papeis[key] = r.id;
    }
    // Dono da etapa = quem pode sair dela.
    await prisma.roleStateTransition.createMany({
      data: [
        { roleId: papeis.ti!, workspaceId: wsId, fromGroup: "started", fromStateName: "Em Desenvolvimento", toGroup: "started", toStateName: "Em Teste", allowed: true },
        { roleId: papeis.qualidade!, workspaceId: wsId, fromGroup: "started", fromStateName: "Em Teste", toGroup: "started", toStateName: "Em Desenvolvimento", allowed: true },
      ],
    });

    const entrar = async (email: string, role: number, roleId: string) => {
      const u = await createUser({ email });
      await prisma.workspaceMember.create({ data: { workspaceId: wsId, memberId: u.id, role, isActive: true, workflowRoleId: roleId } });
      await prisma.projectMember.create({
        data: { projectId, workspaceId: wsId, memberId: u.id, role, isActive: true, workflowRoleId: roleId },
      });
      return u.id;
    };
    devId = await entrar("dev-notif@plane.test", TI, papeis.ti!);
    qaId = await entrar("qa-notif@plane.test", QUALIDADE, papeis.qualidade!);
    qaSemChamadoId = await entrar("qa2-notif@plane.test", QUALIDADE, papeis.qualidade!);

    devClient = apiClient((await createApiToken(devId)).token);
    qaClient = apiClient((await createApiToken(qaId)).token);
  });

  afterAll(() => cleanDb());

  const criarChamado = async (sequencia: number, estado: string, responsaveis: string[]) => {
    const i = await prisma.issue.create({
      data: { projectId, workspaceId: wsId, name: `Chamado ${sequencia}`, sequenceId: sequencia, stateId: estados[estado] },
    });
    for (const assigneeId of responsaveis) {
      await prisma.issueAssignee.create({ data: { issueId: i.id, assigneeId, workspaceId: wsId, projectId } });
    }
    return i;
  };

  it("TI manda para Em Teste: a Qualidade é avisada", async () => {
    const chamado = await criarChamado(301, "Em Desenvolvimento", [devId]);
    expect((await mover(devClient, chamado.id, "Em Teste")).status).toBe(200);

    const avisos = await avisosSobre(chamado.id);
    const quem = avisos.map((a) => a.receiverId);
    expect(quem).toContain(qaId);
    expect(quem).toContain(qaSemChamadoId);
    expect(avisos[0]?.title).toBe("Em Desenvolvimento → Em Teste");
  });

  it("Qualidade devolve com erro: o responsável do TI é avisado", async () => {
    const chamado = await criarChamado(302, "Em Teste", [devId]);
    expect((await mover(qaClient, chamado.id, "Em Desenvolvimento")).status).toBe(200);

    const quem = (await avisosSobre(chamado.id)).map((a) => a.receiverId);
    expect(quem).toContain(devId);
  });

  it("quem moveu não recebe aviso do próprio movimento", async () => {
    const chamado = await criarChamado(303, "Em Desenvolvimento", [devId]);
    await mover(devClient, chamado.id, "Em Teste");

    expect((await avisosSobre(chamado.id)).map((a) => a.receiverId)).not.toContain(devId);
  });

  it("com responsável do setor de destino, o setor inteiro não é incomodado", async () => {
    // qaId já é responsável: só ele precisa saber, não a Qualidade toda.
    const chamado = await criarChamado(304, "Em Desenvolvimento", [devId, qaId]);
    await mover(devClient, chamado.id, "Em Teste");

    const quem = (await avisosSobre(chamado.id)).map((a) => a.receiverId);
    expect(quem).toContain(qaId);
    expect(quem).not.toContain(qaSemChamadoId);
  });

  it("responsável desativado não recebe aviso", async () => {
    // A migração deixou contatos externos como responsáveis de chamados antigos.
    const externo = await createUser({ email: "externo-notif@plane.test" });
    await prisma.user.update({ where: { id: externo.id }, data: { isActive: false } });
    const chamado = await criarChamado(306, "Em Desenvolvimento", [devId, externo.id]);
    await mover(devClient, chamado.id, "Em Teste");

    expect((await avisosSobre(chamado.id)).map((a) => a.receiverId)).not.toContain(externo.id);
  });

  it("editar o chamado sem mudar de etapa não gera aviso", async () => {
    const chamado = await criarChamado(305, "Em Desenvolvimento", [devId, qaId]);
    await devClient.patch(`/workspaces/${wsSlug}/projects/${projectId}/issues/${chamado.id}/`, { name: "Outro título" });

    expect(await avisosSobre(chamado.id)).toHaveLength(0);
  });
});
