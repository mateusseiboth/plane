/**
 * Todo membro ativo do espaço participa de todos os sistemas, como no legado:
 * lá ninguém do time ficava preso a um sistema, e as restrições eram só de
 * ação (pela matriz de Funções). A importação gravou vínculo apenas para quem
 * já tinha mensagem ou responsabilidade no sistema e deixou gente de fora (o
 * desenvolvedor principal do ARH via "Parece que você não tem acesso a este
 * sistema" no próprio sistema).
 *
 * O vínculo é GRAVADO, não virtual: os avisos do sino (Qualidade do sistema,
 * setor da etapa) leem `project_members`.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { seedWorkflowRoles } from "@utils/permissions";
import { syncParticipacaoEmTodoSistema } from "@modules/project/participacao-em-todo-sistema.service";
import { cleanDb } from "@tests/helpers/setup";
import { apiClient, createApiToken, createProject, createUser, createWorkspace } from "@tests/helpers/factory";

let wsId: string;
let wsSlug: string;
let admin: ReturnType<typeof apiClient>;
let funcaoDoAtendimentoId: string;

const createPessoa = async (role: number, extra: { isActive?: boolean; workflowRoleId?: string | null } = {}) => {
  const user = await createUser();
  await prisma.workspaceMember.create({
    data: {
      workspaceId: wsId,
      memberId: user.id,
      role,
      workflowRoleId: extra.workflowRoleId ?? null,
      isActive: extra.isActive ?? true,
    },
  });
  return user;
};

const findVinculos = (memberId: string) =>
  prisma.projectMember.findMany({
    where: { memberId, deletedAt: null },
    select: { projectId: true, role: true, workflowRoleId: true, isActive: true },
  });

beforeAll(async () => {
  await cleanDb();
  const dono = await createUser();
  const ws = await createWorkspace(dono.id);
  wsId = ws.id;
  wsSlug = ws.slug;
  admin = apiClient((await createApiToken(dono.id)).token);
  await seedWorkflowRoles(prisma, wsId);
  funcaoDoAtendimentoId = (
    await prisma.workflowRole.findFirstOrThrow({ where: { workspaceId: wsId, key: "atendimento", deletedAt: null } })
  ).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("todo membro ativo participa de todo sistema", () => {
  it("a sincronização grava o vínculo que falta, com o nível e a função do espaço", async () => {
    const dono = (await prisma.workspaceMember.findFirst({ where: { workspaceId: wsId, role: 20 } }))!;
    const [arh, compras] = await Promise.all([
      createProject(wsId, dono.memberId, { identifier: "RECURS" }),
      createProject(wsId, dono.memberId, { identifier: "COMPRA" }),
    ]);
    const atendente = await createPessoa(6, { workflowRoleId: funcaoDoAtendimentoId });
    await prisma.projectMember.create({
      data: { projectId: compras.id, workspaceId: wsId, memberId: atendente.id, role: 6, isActive: true },
    });

    await syncParticipacaoEmTodoSistema(wsId);

    const vinculos = await findVinculos(atendente.id);
    expect(vinculos.map((v) => v.projectId).toSorted()).toEqual([arh.id, compras.id].toSorted());
    expect(vinculos.find((v) => v.projectId === arh.id)).toMatchObject({
      role: 6,
      workflowRoleId: funcaoDoAtendimentoId,
      isActive: true,
    });
  });

  it("rodar de novo não duplica vínculo", async () => {
    const antes = await prisma.projectMember.count({ where: { workspaceId: wsId, deletedAt: null } });
    await syncParticipacaoEmTodoSistema(wsId);
    expect(await prisma.projectMember.count({ where: { workspaceId: wsId, deletedAt: null } })).toBe(antes);
  });

  it("pessoa desativada no espaço ou na conta não ganha vínculo", async () => {
    const membroInativo = await createPessoa(12, { isActive: false });
    const contaInativa = await createPessoa(12);
    await prisma.user.update({ where: { id: contaInativa.id }, data: { isActive: false } });

    await syncParticipacaoEmTodoSistema(wsId);

    expect(await findVinculos(membroInativo.id)).toEqual([]);
    expect(await findVinculos(contaInativa.id)).toEqual([]);
  });

  it("vínculo desativado continua desativado: quem foi tirado do sistema não volta sozinho", async () => {
    const pessoa = await createPessoa(12);
    const sistema = await prisma.project.findFirstOrThrow({ where: { workspaceId: wsId, identifier: "RECURS" } });
    await prisma.projectMember.create({
      data: { projectId: sistema.id, workspaceId: wsId, memberId: pessoa.id, role: 12, isActive: false },
    });

    await syncParticipacaoEmTodoSistema(wsId);

    const noArh = (await findVinculos(pessoa.id)).filter((v) => v.projectId === sistema.id);
    expect(noArh).toEqual([expect.objectContaining({ isActive: false })]);
  });

  it("sistema criado pela tela já nasce com todo membro ativo", async () => {
    const atendente = await createPessoa(6, { workflowRoleId: funcaoDoAtendimentoId });
    const res = await admin.post(`/workspaces/${wsSlug}/projects/`, { name: "Saúde", identifier: "SAUDE" });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect((await findVinculos(atendente.id)).map((v) => v.projectId)).toContain(id);
  });

  it("pessoa cadastrada pelo admin já participa de todo sistema, além dos marcados", async () => {
    const res = await admin.post(`/workspaces/${wsSlug}/members/create/`, {
      email: `mario.${Date.now()}@quality.teste`,
      first_name: "Mário",
      password: "senha-forte-123",
      role: 12,
      project_ids: [],
    });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const sistemas = await prisma.project.count({ where: { workspaceId: wsId, deletedAt: null } });
    expect(await findVinculos(id)).toHaveLength(sistemas);
  });

  it("a rota de sincronizar inclui Atendimento e Qualidade (antes só nível 10 para cima)", async () => {
    const qualidade = await createPessoa(8);
    const res = await admin.post(`/workspaces/${wsSlug}/projects/sync-members/`, {});
    expect(res.status).toBe(200);
    const sistemas = await prisma.project.count({ where: { workspaceId: wsId, deletedAt: null } });
    expect(await findVinculos(qualidade.id)).toHaveLength(sistemas);
  });

  it("com o vínculo gravado, a pessoa abre o sistema que antes dizia sem acesso", async () => {
    const dev = await createPessoa(12);
    const token = apiClient((await createApiToken(dev.id)).token);
    const arh = await prisma.project.findFirstOrThrow({ where: { workspaceId: wsId, identifier: "RECURS" } });
    expect((await token.get(`/workspaces/${wsSlug}/projects/${arh.id}/`)).status).toBe(403);

    await syncParticipacaoEmTodoSistema(wsId);

    expect((await token.get(`/workspaces/${wsSlug}/projects/${arh.id}/`)).status).toBe(200);
  });
});
