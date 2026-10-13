/**
 * Gestor de Projeto (nível 18) participa de todo sistema, como o admin: vê a
 * lista inteira, `members/me` responde com o nível dele e a triagem aceita o
 * pedido mesmo sem vínculo gravado em `project_members`.
 *
 * Antes só o admin tinha essa regra: quem virava gestor sem vínculo com os
 * sistemas não conseguia aceitar nem recusar chamado em nenhum.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { cleanDb } from "@tests/helpers/setup";
import {
  apiClient,
  createApiToken,
  createIntakeIssue,
  createProject,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

let wsSlug: string;
let wsId: string;
let projetoId: string;
let gestor: ReturnType<typeof apiClient>;
let membro: ReturnType<typeof apiClient>;

const createPessoaNoEspaco = async (role: number) => {
  const user = await createUser();
  const funcao = await prisma.workflowRole.findFirst({ where: { workspaceId: wsId, level: role, deletedAt: null } });
  await prisma.workspaceMember.create({
    data: { workspaceId: wsId, memberId: user.id, role, workflowRoleId: funcao?.id ?? null, isActive: true },
  });
  return apiClient((await createApiToken(user.id)).token);
};

beforeAll(async () => {
  await cleanDb();
  const admin = await createUser();
  const ws = await createWorkspace(admin.id);
  wsSlug = ws.slug;
  wsId = ws.id;
  projetoId = (await createProject(ws.id, admin.id)).id;
  await prisma.workflowRole.createMany({
    data: [
      { workspaceId: wsId, name: "Membro", key: "member", level: 15, permissions: ["intake.review"] },
      {
        workspaceId: wsId,
        name: "Gestor de Projeto",
        key: "gestor_projeto",
        level: 18,
        permissions: ["intake.review"],
      },
    ],
  });
  gestor = await createPessoaNoEspaco(18);
  membro = await createPessoaNoEspaco(15);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("gestor de projeto sem vínculo com o sistema", () => {
  it("vê o sistema na lista e em /details/, com o próprio nível", async () => {
    const lista = await gestor.get(`/workspaces/${wsSlug}/projects/`);
    expect(lista.status).toBe(200);
    const projeto = (await lista.json()).find((p: any) => p.id === projetoId);
    expect(projeto?.member_role).toBe(18);
    const detalhes = await gestor.get(`/workspaces/${wsSlug}/projects/details/`);
    expect((await detalhes.json()).some((p: any) => p.id === projetoId)).toBe(true);
  });

  it("members/me responde com o nível do espaço nas duas rotas", async () => {
    for (const rota of ["members/me", "project-members/me"]) {
      const res = await gestor.get(`/workspaces/${wsSlug}/projects/${projetoId}/${rota}/`);
      expect(res.status).toBe(200);
      expect((await res.json()).role).toBe(18);
    }
  });

  it("aceita um pedido da triagem", async () => {
    const { issue } = await createIntakeIssue(projetoId, wsId);
    const res = await gestor.patch(`/workspaces/${wsSlug}/projects/${projetoId}/inbox-issues/${issue.id}/`, {
      status: 1,
    });
    expect(res.status).toBe(200);
  });

  it("membro comum sem vínculo continua de fora do sistema", async () => {
    const lista = await membro.get(`/workspaces/${wsSlug}/projects/`);
    expect((await lista.json()).some((p: any) => p.id === projetoId)).toBe(false);
    const me = await membro.get(`/workspaces/${wsSlug}/projects/${projetoId}/members/me/`);
    expect(me.status).toBe(403);
  });
});
