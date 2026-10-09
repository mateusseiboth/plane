/**
 * "Precisa comentar antes de mudar a etapa" como ação da matriz de permissões
 * (`issue.require_comment_to_move`). Marcada na função, a pessoa comenta antes
 * de mover; desmarcada, move direto. As exceções por pessoa valem por cima da
 * função, nos dois sentidos. Entra por sessão: chave de API é sempre isenta.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { seedWorkflowRoles } from "@utils/permissions";
import { cleanDb } from "@tests/helpers/setup";
import { setPassword, signIn, withBearer } from "@tests/helpers/session";
import {
  addMember,
  apiClient,
  createApiToken,
  createProject,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

const ACAO = "issue.require_comment_to_move";
const ERRO = { path: "state_id", message: "Comente no chamado antes de mudar a etapa." };

describe("Permissão: comentar antes de mudar a etapa", () => {
  let admin: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let projectId: string;
  const etapa: Record<string, string> = {};
  const pessoa: Record<string, { id: string; jwt: string }> = {};

  const base = () => `/api/v1/workspaces/${wsSlug}/projects/${projectId}`;
  const enviar = (quem: string, metodo: string, caminho: string, corpo: unknown) =>
    withBearer(pessoa[quem]!.jwt, `${base()}${caminho}`, { method: metodo, body: JSON.stringify(corpo) });
  const criarChamado = async (quem: string) => {
    const res = await enviar(quem, "POST", "/issues/", { name: `Chamado de ${quem}` });
    expect(res.status).toBe(201);
    return ((await res.json()) as any).id as string;
  };
  const moverSemComentar = async (quem: string) => {
    const id = await criarChamado(quem);
    return enviar(quem, "PATCH", `/issues/${id}/`, { state_id: etapa.Todo });
  };
  const definirExcecao = (quem: string, excecao: { granted: string[]; revoked: string[] }) =>
    admin.put(`/workspaces/${wsSlug}/roles/members/${pessoa[quem]!.id}/`, excecao);

  // Membro (15): move de Backlog para Todo pela matriz de transições padrão.
  const criarMembro = async (workspaceId: string, apelido: string) => {
    const email = `${apelido}-perm-mover@plane.test`;
    const user = await createUser({ email });
    await setPassword(user.id);
    await addMember(workspaceId, user.id, 15, projectId);
    return { apelido, email, id: user.id };
  };

  beforeAll(async () => {
    await cleanDb();
    const dono = await createUser({ email: "dono-perm-mover@plane.test" });
    const ws = await createWorkspace(dono.id);
    wsSlug = ws.slug;
    projectId = (await createProject(ws.id, dono.id)).id;
    for (const e of await prisma.state.findMany({ where: { projectId, deletedAt: null } })) etapa[e.name] = e.id;
    admin = apiClient((await createApiToken(dono.id)).token);

    const membros = [await criarMembro(ws.id, "ana"), await criarMembro(ws.id, "bruno")];
    await seedWorkflowRoles(prisma, ws.id);
    const sessoes = await Promise.all(membros.map((m) => signIn(m.email)));
    membros.forEach((m, i) => (pessoa[m.apelido] = { id: m.id, jwt: sessoes[i]! }));
  });

  afterAll(() => cleanDb());

  it("a tela de Funções recebe a ação no catálogo, no grupo Chamados", async () => {
    const res = await admin.get(`/workspaces/${wsSlug}/roles/actions/`);
    const acao = ((await res.json()) as any[]).find((a) => a.key === ACAO);
    expect(acao).toMatchObject({
      label: "Precisa comentar antes de mudar a etapa",
      group: "Chamados",
      scope: "project",
    });
    expect(typeof acao.description).toBe("string");
  });

  it("função com a ação marcada: mover sem comentar é recusado", async () => {
    const res = await moverSemComentar("ana");
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).errors).toEqual([ERRO]);
  });

  it("exceção por pessoa negando a ação: move sem comentar", async () => {
    expect((await definirExcecao("ana", { granted: [], revoked: [ACAO] })).status).toBe(200);
    expect((await moverSemComentar("ana")).status).toBe(200);
  });

  it("função com a ação desmarcada na tela: move sem comentar", async () => {
    const funcoes = (await (await admin.get(`/workspaces/${wsSlug}/roles/`)).json()) as any[];
    const membro = funcoes.find((f) => f.key === "member");
    expect(membro.permissions).toContain(ACAO);

    const semObrigacao = membro.permissions.filter((p: string) => p !== ACAO);
    const salvo = await admin.patch(`/workspaces/${wsSlug}/roles/${membro.id}/`, { permissions: semObrigacao });
    expect(salvo.status).toBe(200);
    expect(((await salvo.json()) as any).permissions).not.toContain(ACAO);

    expect((await moverSemComentar("bruno")).status).toBe(200);
  });

  it("exceção por pessoa concedendo a ação: volta a exigir o comentário", async () => {
    expect((await definirExcecao("bruno", { granted: [ACAO], revoked: [] })).status).toBe(200);
    const res = await moverSemComentar("bruno");
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).errors).toEqual([ERRO]);
  });
});
