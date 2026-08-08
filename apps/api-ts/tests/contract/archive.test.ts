/**
 * Arquivar e restaurar chamados.
 *
 * A interface já oferecia "Arquivar" e a tela de arquivados desde sempre, mas
 * NÃO existia backend: a tela quebrava com NOT_FOUND e o botão não fazia efeito
 * nenhum. Estes testes fixam o contrato dos quatro endpoints e — o ponto que
 * torna a funcionalidade real — que arquivar TIRA o chamado da listagem normal.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { cleanDb } from "@tests/helpers/setup";
import { apiClient, createApiToken, createProject, createUser, createWorkspace } from "@tests/helpers/factory";

describe("TestArchive", () => {
  let client: ReturnType<typeof apiClient>;
  let leitor: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let wsId: string;
  let projectId: string;

  const criarChamado = async (nome: string, sequencia: number) =>
    prisma.issue.create({ data: { projectId, workspaceId: wsId, name: nome, sequenceId: sequencia } });

  beforeAll(async () => {
    await cleanDb();
    const owner = await createUser({ email: "arquivo-owner@plane.test" });
    const ws = await createWorkspace(owner.id);
    wsSlug = ws.slug;
    wsId = ws.id;
    client = apiClient((await createApiToken(owner.id)).token);

    const projeto = await createProject(ws.id, owner.id);
    projectId = projeto.id;

    // Visualizador (nível 5): lê tudo, não edita nada — portanto não arquiva.
    const visualizador = await createUser({ email: "arquivo-leitor@plane.test" });
    await prisma.workspaceMember.create({
      data: { workspaceId: ws.id, memberId: visualizador.id, role: 5, isActive: true },
    });
    await prisma.projectMember.create({
      data: { projectId, workspaceId: ws.id, memberId: visualizador.id, role: 5, isActive: true },
    });
    leitor = apiClient((await createApiToken(visualizador.id)).token);
  });

  afterAll(() => cleanDb());

  const issues = () => `/workspaces/${wsSlug}/projects/${projectId}/issues/`;
  const arquivados = () => `/workspaces/${wsSlug}/projects/${projectId}/archived-issues/`;

  it("a lista de arquivados começa vazia e responde 200 (antes era NOT_FOUND)", async () => {
    const res = await client.get(arquivados());
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.total_count).toBe(0);
    expect(data.results).toEqual([]);
  });

  it("arquivar devolve a data e tira o chamado da listagem normal", async () => {
    const chamado = await criarChamado("Some da listagem ao arquivar", 101);

    const antes = (await (await client.get(issues())).json()) as any;
    expect(antes.results.some((i: any) => i.id === chamado.id)).toBe(true);

    const res = await client.post(`${issues()}${chamado.id}/archive/`, {});
    expect(res.status).toBe(200);
    expect(typeof ((await res.json()) as any).archived_at).toBe("string");

    const depois = (await (await client.get(issues())).json()) as any;
    expect(depois.results.some((i: any) => i.id === chamado.id)).toBe(false);

    const lista = (await (await client.get(arquivados())).json()) as any;
    expect(lista.results.some((i: any) => i.id === chamado.id)).toBe(true);
  });

  it("restaurar devolve o chamado para a listagem normal", async () => {
    const chamado = await criarChamado("Volta ao restaurar", 102);
    await client.post(`${issues()}${chamado.id}/archive/`, {});

    const res = await client.delete(`${issues()}${chamado.id}/archive/`);
    expect(res.status).toBe(204);

    const normal = (await (await client.get(issues())).json()) as any;
    expect(normal.results.some((i: any) => i.id === chamado.id)).toBe(true);
    const lista = (await (await client.get(arquivados())).json()) as any;
    expect(lista.results.some((i: any) => i.id === chamado.id)).toBe(false);
  });

  it("consulta um chamado arquivado pelo id", async () => {
    const chamado = await criarChamado("Consulta direta", 103);
    await client.post(`${issues()}${chamado.id}/archive/`, {});

    const res = await client.get(`${issues()}${chamado.id}/archive/`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).id).toBe(chamado.id);
  });

  it("consultar como arquivado um chamado que NÃO está arquivado devolve 404", async () => {
    const chamado = await criarChamado("Nunca arquivado", 104);
    const res = await client.get(`${issues()}${chamado.id}/archive/`);
    expect(res.status).toBe(404);
  });

  it("arquivar chamado inexistente devolve 404, não 500", async () => {
    const res = await client.post(`${issues()}00000000-0000-0000-0000-000000000000/archive/`, {});
    expect(res.status).toBe(404);
  });

  it("Visualizador não arquiva nem restaura", async () => {
    const chamado = await criarChamado("Protegido do visualizador", 105);
    expect((await leitor.post(`${issues()}${chamado.id}/archive/`, {})).status).toBe(403);

    await client.post(`${issues()}${chamado.id}/archive/`, {});
    expect((await leitor.delete(`${issues()}${chamado.id}/archive/`)).status).toBe(403);
  });

  it("a listagem de arquivados aceita os mesmos filtros da normal", async () => {
    const urgente = await criarChamado("Arquivado urgente", 106);
    await prisma.issue.update({ where: { id: urgente.id }, data: { priority: "urgent" } });
    await client.post(`${issues()}${urgente.id}/archive/`, {});

    const filtrado = (await (await client.get(`${arquivados()}?priority=urgent`)).json()) as any;
    expect(filtrado.results.every((i: any) => i.priority === "urgent")).toBe(true);
    expect(filtrado.results.some((i: any) => i.id === urgente.id)).toBe(true);
  });
});
