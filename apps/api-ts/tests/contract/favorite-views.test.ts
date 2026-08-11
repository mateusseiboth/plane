/**
 * Views favoritas do projeto — /projects/{id}/user-favorite-views/.
 *
 * A estrela na lista de visualizações chamava estas rotas e recebia NOT_FOUND:
 * o favorito nunca era gravado e a estrela voltava sozinha ao recarregar.
 * Elas gravam na MESMA tabela dos demais favoritos (entity_type = "view"), o
 * que estes testes também fixam — senão a barra lateral e a tela de views
 * mostrariam listas diferentes.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import {
  addMember,
  apiClient,
  createApiToken,
  createProject,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

describe("TestFavoriteViews", () => {
  let client: ReturnType<typeof apiClient>;
  let outroMembro: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let wsId: string;
  let ownerId: string;
  let projectId: string;
  let outroProjectId: string;

  const criarView = async (nome: string, projeto = projectId) => {
    const res = await client.post(`/workspaces/${wsSlug}/projects/${projeto}/views/`, { name: nome });
    expect(res.status).toBe(201);
    return ((await res.json()) as any).id as string;
  };

  beforeAll(async () => {
    await cleanDb();
    const owner = await createUser({ email: "fav-views-owner@plane.test" });
    ownerId = owner.id;
    client = apiClient((await createApiToken(owner.id)).token);
    const ws = await createWorkspace(owner.id);
    wsSlug = ws.slug;
    wsId = ws.id;
    projectId = (await createProject(ws.id, owner.id, { identifier: "FAVV" })).id;
    outroProjectId = (await createProject(ws.id, owner.id, { identifier: "FAVW" })).id;

    const colega = await createUser({ email: "fav-views-colega@plane.test" });
    await addMember(wsId, colega.id, 15, projectId, 15);
    outroMembro = apiClient((await createApiToken(colega.id)).token);
  });

  afterAll(() => cleanDb());

  const favoritas = (projeto = projectId) => `/workspaces/${wsSlug}/projects/${projeto}/user-favorite-views/`;
  const views = (projeto = projectId) => `/workspaces/${wsSlug}/projects/${projeto}/views/`;

  const listarFavoritas = async (c = client, projeto = projectId) => {
    const res = await c.get(favoritas(projeto));
    expect(res.status).toBe(200);
    return (await res.json()) as any[];
  };

  it("a lista começa vazia e devolve array puro", async () => {
    const lista = await listarFavoritas();
    expect(lista).toBeInstanceOf(Array);
    expect(lista).toHaveLength(0);
  });

  it("favoritar devolve 204 e passa a listar a view", async () => {
    const viewId = await criarView("Chamados atrasados");

    const res = await client.post(favoritas(), { view: viewId });
    expect(res.status).toBe(204);

    const lista = await listarFavoritas();
    expect(lista).toHaveLength(1);
    expect(lista[0].view).toBe(viewId);
    expect(lista[0].entity_type).toBe("view");
    expect(lista[0].name).toBe("Chamados atrasados");
    expect(lista[0].project_id).toBe(projectId);
  });

  it("o favorito aparece também na lista geral de favoritos", async () => {
    const gerais = (await (await client.get(`/workspaces/${wsSlug}/user-favorites/`)).json()) as any[];
    expect(gerais.some((f) => f.entity_type === "view")).toBe(true);
  });

  it("a view passa a vir com is_favorite verdadeiro", async () => {
    const lista = (await (await client.get(views())).json()) as any;
    const favorita = lista.results.find((v: any) => v.name === "Chamados atrasados");
    expect(favorita.is_favorite).toBe(true);

    const detalhe = (await (await client.get(`${views()}${favorita.id}/`)).json()) as any;
    expect(detalhe.is_favorite).toBe(true);
  });

  it("favoritar duas vezes não duplica o registro", async () => {
    const viewId = (await listarFavoritas())[0].view;
    expect((await client.post(favoritas(), { view: viewId })).status).toBe(204);
    expect(await listarFavoritas()).toHaveLength(1);
  });

  it("o favorito é de quem favoritou — outro membro não o vê", async () => {
    expect(await listarFavoritas(outroMembro)).toHaveLength(0);
    const lista = (await (await outroMembro.get(views())).json()) as any;
    expect(lista.results.every((v: any) => v.is_favorite === false)).toBe(true);
  });

  it("desfavoritar devolve 204 e tira da lista", async () => {
    const viewId = (await listarFavoritas())[0].view;

    const res = await client.delete(`${favoritas()}${viewId}/`);
    expect(res.status).toBe(204);

    expect(await listarFavoritas()).toHaveLength(0);
    const lista = (await (await client.get(views())).json()) as any;
    expect(lista.results.find((v: any) => v.id === viewId).is_favorite).toBe(false);
  });

  it("desfavoritar o que não é favorito devolve 404", async () => {
    const viewId = await criarView("Nunca favoritada");
    expect((await client.delete(`${favoritas()}${viewId}/`)).status).toBe(404);
  });

  it("favoritar sem informar a view devolve 400", async () => {
    expect((await client.post(favoritas(), {})).status).toBe(400);
  });

  it("favoritar view inexistente devolve 404", async () => {
    const res = await client.post(favoritas(), { view: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(404);
  });

  it("favoritar view de outro projeto devolve 404", async () => {
    const alheia = await criarView("View do outro sistema", outroProjectId);
    expect((await client.post(favoritas(), { view: alheia })).status).toBe(404);
  });

  it("quem não é membro do projeto não lista nem favorita", async () => {
    const estranho = await createUser({ email: "fav-views-estranho@plane.test" });
    await addMember(wsId, estranho.id, 15);
    const estranhoClient = apiClient((await createApiToken(estranho.id)).token);

    expect((await estranhoClient.get(favoritas())).status).toBe(403);
    expect((await estranhoClient.post(favoritas(), { view: "00000000-0000-0000-0000-000000000000" })).status).toBe(403);
  });
});
