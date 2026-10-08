/**
 * Comentário obrigatório antes de mudar a etapa do chamado.
 *
 * O dono do produto pediu que ninguém movimente um chamado sem deixar registro
 * do porquê. Não é modal: a pessoa só precisa ter comentado no chamado DEPOIS
 * da última mudança de etapa (ou da criação). A regra vale para quem está
 * logado; script com chave de API, aceite na triagem e quem só cria o chamado
 * seguem livres.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { cleanDb } from "@tests/helpers/setup";
import { setPassword, signIn, withBearer } from "@tests/helpers/session";
import {
  apiClient,
  createApiToken,
  createIntakeIssue,
  createProject,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

const ERRO = { path: "state_id", message: "Comente no chamado antes de mudar a etapa." };

describe("Comentário antes de mover o chamado", () => {
  let jwt: string;
  let script: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let wsId: string;
  let projectId: string;
  const etapa: Record<string, string> = {};

  const base = () => `/api/v1/workspaces/${wsSlug}/projects/${projectId}`;
  const enviar = (metodo: string, caminho: string, corpo: unknown) =>
    withBearer(jwt, `${base()}${caminho}`, { method: metodo, body: JSON.stringify(corpo) });
  const mover = (issueId: string, nome: string) => enviar("PATCH", `/issues/${issueId}/`, { state_id: etapa[nome] });
  const comentar = (issueId: string) =>
    enviar("POST", `/issues/${issueId}/comments/`, { comment_html: "<p>Analisado, segue para a próxima etapa.</p>" });
  const criarChamado = async (nome: string) => {
    const res = await enviar("POST", "/issues/", { name: nome });
    expect(res.status).toBe(201);
    return ((await res.json()) as any).id as string;
  };

  beforeAll(async () => {
    await cleanDb();
    const dono = await createUser({ email: "dono-mover@plane.test" });
    await setPassword(dono.id);
    const ws = await createWorkspace(dono.id);
    wsSlug = ws.slug;
    wsId = ws.id;
    projectId = (await createProject(ws.id, dono.id)).id;
    const estados = await prisma.state.findMany({ where: { projectId, deletedAt: null } });
    for (const e of estados) etapa[e.name] = e.id;
    jwt = await signIn("dono-mover@plane.test");
    script = apiClient((await createApiToken(dono.id)).token);
  });

  afterAll(() => cleanDb());

  it("mover sem comentar é recusado com o erro no campo da etapa", async () => {
    const id = await criarChamado("Sem comentário");
    const res = await mover(id, "Todo");
    expect(res.status).toBe(400);
    const corpo = (await res.json()) as any;
    expect(corpo.detail).toBe(ERRO.message);
    expect(corpo.errors).toEqual([ERRO]);

    const chamado = await prisma.issue.findFirstOrThrow({ where: { id }, select: { stateId: true } });
    expect(chamado.stateId).toBe(etapa.Backlog!);
  });

  it("comentar e mover passa; mover de novo sem comentar volta a ser recusado", async () => {
    const id = await criarChamado("Com comentário");
    expect((await comentar(id)).status).toBe(201);
    expect((await mover(id, "Todo")).status).toBe(200);

    const denovo = await mover(id, "In Progress");
    expect(denovo.status).toBe(400);
    expect(((await denovo.json()) as any).errors).toEqual([ERRO]);

    expect((await comentar(id)).status).toBe(201);
    expect((await mover(id, "In Progress")).status).toBe(200);
  });

  it("editar o chamado sem trocar a etapa não exige comentário", async () => {
    const id = await criarChamado("Só edição");
    const res = await enviar("PATCH", `/issues/${id}/`, { name: "Só edição (revisado)", state_id: etapa.Backlog });
    expect(res.status).toBe(200);
  });

  it("criar o chamado já numa etapa não exige comentário", async () => {
    const res = await enviar("POST", "/issues/", { name: "Criado em andamento", state_id: etapa["In Progress"] });
    expect(res.status).toBe(201);
  });

  it("concluir pela home segue a mesma regra", async () => {
    const id = await criarChamado("Concluir pela home");
    expect((await mover(id, "Done")).status).toBe(400);
    await comentar(id);
    expect((await mover(id, "Done")).status).toBe(200);
  });

  it("script com chave de API move sem comentário", async () => {
    const id = await criarChamado("Movido por script");
    const res = await script.patch(`/workspaces/${wsSlug}/projects/${projectId}/issues/${id}/`, {
      state_id: etapa.Todo,
    });
    expect(res.status).toBe(200);
  });

  it("ação em lote recusa se algum chamado não foi comentado", async () => {
    const comentado = await criarChamado("Lote comentado");
    const calado = await criarChamado("Lote sem comentário");
    await comentar(comentado);

    const lote = (issueIds: string[]) =>
      enviar("POST", "/issues/bulk-update/", { issue_ids: issueIds, state: etapa.Todo });

    const recusado = await lote([comentado, calado]);
    expect(recusado.status).toBe(400);
    expect(((await recusado.json()) as any).errors).toEqual([ERRO]);

    await comentar(calado);
    expect((await lote([comentado, calado])).status).toBe(200);
  });

  it("aceitar a solicitação na triagem continua passando sem comentário", async () => {
    const { issue } = await createIntakeIssue(projectId, wsId, { status: -2 });
    const res = await withBearer(jwt, `/api/v1/workspaces/${wsSlug}/projects/${projectId}/inbox-issues/${issue.id}/`, {
      method: "PATCH",
      body: JSON.stringify({ status: 1 }),
    });
    expect(res.status).toBe(200);
  });
});
