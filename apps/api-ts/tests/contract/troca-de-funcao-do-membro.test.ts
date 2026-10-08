/**
 * Trocar a função de alguém em Configurações > Membros precisa gravar NESSA pessoa.
 *
 * A tela mandava o id da associação (workspace_members.id) e a rota procura pelo
 * id do usuário. O `updateMany` não casava ninguém, a resposta era 200 e, ao
 * recarregar, cada linha voltava para a função antiga. Com duas pessoas de nome
 * igual na busca, parecia que as funções tinham trocado de linha.
 *
 * Contrato: `/workspaces/:slug/members/:pk/` recebe o id do USUÁRIO (o mesmo de
 * reset-password, freeze e da listagem em `member.id`). Id que não é de um
 * membro do espaço responde 404, nunca 200 sem gravar.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { defaultRoleForLevel, seedWorkflowRoles } from "@utils/permissions";
import { cleanDb } from "@tests/helpers/setup";
import { apiClient, createApiToken, createUser, createWorkspace } from "@tests/helpers/factory";

const MEMBRO = 15;
const GESTOR_DE_PROJETO = 18;
const QUALIDADE = 8;

type MembroDaListagem = { id: string; role: number; member: { id: string; email: string } };

const findLinha = (linhas: MembroDaListagem[], userId: string) => linhas.find((l) => l.member.id === userId);

describe("troca de função do membro", () => {
  let slug: string;
  let wsId: string;
  let admin: ReturnType<typeof apiClient>;
  let fabianeQualidade: { id: string; client: ReturnType<typeof apiClient> };
  let fabiane: { id: string; client: ReturnType<typeof apiClient> };

  const createFabiane = async (email: string, role: number) => {
    const user = await createUser({ email, firstName: "Fabiane", lastName: "Carvalho", displayName: "fabiane" });
    await prisma.workspaceMember.create({ data: { workspaceId: wsId, memberId: user.id, role, isActive: true } });
    return { id: user.id, client: apiClient((await createApiToken(user.id)).token) };
  };

  const readListagem = async () =>
    (await (await admin.get(`/workspaces/${slug}/members/`)).json()) as MembroDaListagem[];
  const readVinculo = (userId: string) =>
    prisma.workspaceMember.findFirst({
      where: { workspaceId: wsId, memberId: userId },
      include: { workflowRole: true },
    });

  beforeAll(async () => {
    await cleanDb();
    const dono = await createUser({ email: "dono-funcoes@plane.test" });
    const ws = await createWorkspace(dono.id);
    slug = ws.slug;
    wsId = ws.id;
    admin = apiClient((await createApiToken(dono.id)).token);
    fabianeQualidade = await createFabiane("fabiane.fabiane@plane.test", QUALIDADE);
    fabiane = await createFabiane("fabiane@plane.test", MEMBRO);
    await seedWorkflowRoles(prisma, ws.id);
  });

  afterAll(() => cleanDb());

  it("o id da associação (o que a tela mandava) responde 404 e não grava em ninguém", async () => {
    const linha = findLinha(await readListagem(), fabianeQualidade.id)!;
    expect(linha.id).not.toBe(fabianeQualidade.id);

    const res = await admin.patch(`/workspaces/${slug}/members/${linha.id}/`, { role: GESTOR_DE_PROJETO });
    expect(res.status).toBe(404);

    expect((await readVinculo(fabianeQualidade.id))?.role).toBe(QUALIDADE);
    expect((await readVinculo(fabiane.id))?.role).toBe(MEMBRO);
  });

  it("trocar pela pessoa grava o nível e a função dela e devolve o membro em snake_case", async () => {
    const res = await admin.patch(`/workspaces/${slug}/members/${fabianeQualidade.id}/`, { role: GESTOR_DE_PROJETO });
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as any;
    expect(corpo.member.id).toBe(fabianeQualidade.id);
    expect(corpo.member.email).toBe("fabiane.fabiane@plane.test");
    expect(corpo.role).toBe(GESTOR_DE_PROJETO);
    expect(corpo.workflow_role.name).toBe(defaultRoleForLevel(GESTOR_DE_PROJETO).name);

    const vinculo = await readVinculo(fabianeQualidade.id);
    expect(vinculo?.role).toBe(GESTOR_DE_PROJETO);
    expect(vinculo?.workflowRole?.level).toBe(GESTOR_DE_PROJETO);
  });

  it("a homônima não muda: cada linha da listagem mostra a função da própria pessoa", async () => {
    await admin.patch(`/workspaces/${slug}/members/${fabiane.id}/`, { role: QUALIDADE });

    const linhas = await readListagem();
    expect(findLinha(linhas, fabianeQualidade.id)?.role).toBe(GESTOR_DE_PROJETO);
    expect(findLinha(linhas, fabiane.id)?.role).toBe(QUALIDADE);
    expect((await readVinculo(fabiane.id))?.workflowRole?.level).toBe(QUALIDADE);
  });

  it("o detalhe do membro lê a função nova", async () => {
    const res = await admin.get(`/workspaces/${slug}/members/${fabianeQualidade.id}/`);
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as any;
    expect(corpo.role).toBe(GESTOR_DE_PROJETO);
    expect(corpo.member.email).toBe("fabiane.fabiane@plane.test");
    expect(corpo.workflow_role.name).toBe(defaultRoleForLevel(GESTOR_DE_PROJETO).name);
  });

  it("o /me da própria pessoa já vem com a função nova, sem sair e entrar", async () => {
    const me = (await (await fabianeQualidade.client.get(`/workspaces/${slug}/workspace-members/me/`)).json()) as any;
    expect(me.role).toBe(GESTOR_DE_PROJETO);
    const membersMe = (await (await fabianeQualidade.client.get(`/workspaces/${slug}/members/me/`)).json()) as any;
    expect(membersMe.role).toBe(GESTOR_DE_PROJETO);
    const acoes = (await (await fabianeQualidade.client.get(`/workspaces/${slug}/roles/me/`)).json()) as any;
    expect(acoes.role.level).toBe(GESTOR_DE_PROJETO);
  });

  it("remover com o id da associação responde 404 e a pessoa continua no espaço", async () => {
    const linha = findLinha(await readListagem(), fabiane.id)!;
    expect((await admin.delete(`/workspaces/${slug}/members/${linha.id}/`)).status).toBe(404);
    expect((await readVinculo(fabiane.id))?.deletedAt).toBeNull();
  });
});
