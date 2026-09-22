/**
 * Marca de não lido: o chamado fica em destaque para o RESPONSÁVEL enquanto ele
 * não abrir o detalhe depois da última alteração relevante (comentário, etapa ou
 * atribuição) feita por OUTRA pessoa. Contrato pela API de verdade.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { cleanDb } from "@tests/helpers/setup";
import { apiClient, createApiToken, createProject, createUser, createWorkspace } from "@tests/helpers/factory";

describe("chamado não lido", () => {
  let dono: ReturnType<typeof apiClient>;
  let colega: ReturnType<typeof apiClient>;
  let base = "";
  let colegaId = "";
  let donoId = "";
  let estadoNovo = "";

  beforeAll(async () => {
    await cleanDb();
    const donoUser = await createUser({ email: "dono-naolido@plane.test" });
    donoId = donoUser.id;
    const ws = await createWorkspace(donoUser.id);
    const projeto = await createProject(ws.id, donoUser.id);
    const colegaUser = await createUser({ email: "colega-naolido@plane.test" });
    colegaId = colegaUser.id;
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, memberId: colegaId, role: 20, isActive: true } });
    await prisma.projectMember.create({
      data: { projectId: projeto.id, workspaceId: ws.id, memberId: colegaId, role: 20, isActive: true },
    });
    estadoNovo = (
      await prisma.state.create({
        data: {
          name: "Em Análise",
          slug: "em-analise",
          group: "started",
          projectId: projeto.id,
          workspaceId: ws.id,
          sequence: 99,
        },
      })
    ).id;
    base = `/workspaces/${ws.slug}/projects/${projeto.id}/issues`;
    dono = apiClient((await createApiToken(donoId)).token);
    colega = apiClient((await createApiToken(colegaId)).token);
  });

  afterAll(() => cleanDb());

  const criar = async (nome: string) => {
    const res = await dono.post(`${base}/`, { name: nome, assignee_ids: [colegaId] });
    expect(res.status).toBe(201);
    return ((await res.json()) as { id: string }).id;
  };

  const naoLido = async (cliente: ReturnType<typeof apiClient>, id: string) => {
    const res = await cliente.get(`${base}/${id}/`);
    return ((await res.json()) as { is_unread: boolean }).is_unread;
  };

  const abrir = async (cliente: ReturnType<typeof apiClient>, id: string) => {
    const res = await cliente.post(`${base}/${id}/read/`, {});
    expect(res.status).toBe(204);
  };

  it("atribuir o chamado a alguém deixa o chamado não lido para ele, e só para ele", async () => {
    const id = await criar("Atribuído ao colega");
    expect(await naoLido(colega, id)).toBe(true);
    expect(await naoLido(dono, id)).toBe(false);
  });

  it("abrir o detalhe marca como lido", async () => {
    const id = await criar("Abrir marca lido");
    await abrir(colega, id);
    expect(await naoLido(colega, id)).toBe(false);
  });

  it("comentário de outra pessoa volta a marcar como não lido", async () => {
    const id = await criar("Comentário");
    await abrir(colega, id);
    await dono.post(`${base}/${id}/comments/`, { comment_html: "<p>Veja isto</p>" });
    expect(await naoLido(colega, id)).toBe(true);
  });

  it("o próprio comentário não marca o autor", async () => {
    const id = await criar("Comentário próprio");
    await abrir(colega, id);
    await colega.post(`${base}/${id}/comments/`, { comment_html: "<p>Eu mesmo</p>" });
    expect(await naoLido(colega, id)).toBe(false);
    // O dono também é responsável (quem cria entra junto) e o comentário foi do colega.
    expect(await naoLido(dono, id)).toBe(true);
  });

  it("mudança de etapa por outra pessoa marca como não lido", async () => {
    const id = await criar("Etapa");
    await abrir(colega, id);
    await dono.patch(`${base}/${id}/`, { state_id: estadoNovo });
    expect(await naoLido(colega, id)).toBe(true);
  });

  it("alteração que não é relevante (título) não marca", async () => {
    const id = await criar("Título");
    await abrir(colega, id);
    await dono.patch(`${base}/${id}/`, { name: "Título novo" });
    expect(await naoLido(colega, id)).toBe(false);
  });

  it("quem deixa de ser responsável perde a marca", async () => {
    const id = await criar("Desatribuído");
    await dono.patch(`${base}/${id}/`, { assignee_ids: [donoId] });
    expect(await naoLido(colega, id)).toBe(false);
  });

  it("filtro de não lidos devolve só os chamados não lidos de quem pergunta", async () => {
    const lido = await criar("Filtro lido");
    const pendente = await criar("Filtro pendente");
    await abrir(colega, lido);

    const res = await colega.get(`${base}/?unread=true&per_page=100`);
    const corpo = (await res.json()) as { results: { id: string; is_unread: boolean }[] };
    const ids = corpo.results.map((r) => r.id);
    expect(ids).toContain(pendente);
    expect(ids).not.toContain(lido);
    expect(corpo.results.every((r) => r.is_unread)).toBe(true);
  });

  it("a listagem normal traz a marca em cada chamado", async () => {
    const pendente = await criar("Listagem com marca");
    const res = await colega.get(`${base}/?per_page=100`);
    const corpo = (await res.json()) as { results: { id: string; is_unread: boolean }[] };
    expect(corpo.results.find((r) => r.id === pendente)?.is_unread).toBe(true);
  });
});
