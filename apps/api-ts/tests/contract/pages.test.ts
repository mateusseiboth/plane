/**
 * Contract tests for page/wiki endpoints.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import {
  addMember,
  apiClient,
  createApiToken,
  createMemberWithToken,
  createProject,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

describe("TestPageListCreateAPIEndpoint", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    const token = await createApiToken(user.id);
    const ws = await createWorkspace(user.id);
    wsSlug = ws.slug;
    client = apiClient(token.token);
  });

  afterAll(() => cleanDb());

  const url = () => `/workspaces/${wsSlug}/pages/`;

  it("create page returns 201", async () => {
    const res = await client.post(url(), { name: "Test Wiki Page" });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.name).toBe("Test Wiki Page");
    expect(data.id).toBeDefined();
  });

  it("list pages returns paginated results", async () => {
    const res = await client.get(url());
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.results).toBeInstanceOf(Array);
    expect(typeof data.total_count).toBe("number");
  });

  it("create page without name returns 400", async () => {
    const res = await client.post(url(), { description_html: "<p>no name</p>" });
    expect(res.status).toBe(400);
  });

  it("get page detail", async () => {
    const createRes = await client.post(url(), { name: "Detail Page" });
    const created = await createRes.json() as any;
    const res = await client.get(`${url()}${created.id}/`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.id).toBe(created.id);
    expect(data.name).toBe("Detail Page");
  });

  it("update page content", async () => {
    const createRes = await client.post(url(), { name: "Updatable Page" });
    const created = await createRes.json() as any;
    const res = await client.patch(`${url()}${created.id}/`, {
      name: "Updated Title",
      description_html: "<p>Updated content</p>",
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.name).toBe("Updated Title");
  });

  it("lock and unlock page", async () => {
    const createRes = await client.post(url(), { name: "Lockable" });
    const created = await createRes.json() as any;

    const lockRes = await client.post(`${url()}${created.id}/lock/`, {});
    expect(lockRes.status).toBe(200);
    const locked = await lockRes.json() as any;
    expect(locked.is_locked).toBe(true);

    const unlockRes = await client.delete(`${url()}${created.id}/lock/`);
    expect(unlockRes.status).toBe(200);
  });

  it("archive and unarchive page", async () => {
    const createRes = await client.post(url(), { name: "Archivable" });
    const created = await createRes.json() as any;

    const archiveRes = await client.post(`${url()}${created.id}/archive/`, {});
    expect(archiveRes.status).toBe(200);

    const unarchiveRes = await client.delete(`${url()}${created.id}/archive/`);
    expect(unarchiveRes.status).toBe(200);
  });

  it("delete page returns 204", async () => {
    const createRes = await client.post(url(), { name: "Deletable Page" });
    const created = await createRes.json() as any;
    const res = await client.delete(`${url()}${created.id}/`);
    expect(res.status).toBe(204);
  });
});

/**
 * Rotas do wiki que o frontend e o servidor `live` chamam e que respondiam 404:
 * favoritas, arquivadas, mover de projeto, menções e o binário do editor.
 * São todas da árvore de projeto — é por ela que `ProjectPageService` e
 * `apps/live` falam.
 */
describe("Páginas — favoritas, arquivadas, mover, menções e binário", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let wsId: string;
  let projectId: string;
  let outroProjectId: string;
  let donoId: string;

  beforeAll(async () => {
    await cleanDb();
    const dono = await createUser({ email: "wiki-dono@plane.test", displayName: "Dona do Wiki" });
    donoId = dono.id;
    const ws = await createWorkspace(dono.id);
    wsSlug = ws.slug;
    wsId = ws.id;
    client = apiClient((await createApiToken(dono.id)).token);
    projectId = (await createProject(ws.id, dono.id, { identifier: "WIKI" })).id;
    outroProjectId = (await createProject(ws.id, dono.id, { identifier: "DEST" })).id;
  });

  afterAll(() => cleanDb());

  const paginas = (pid = projectId) => `/workspaces/${wsSlug}/projects/${pid}/pages/`;
  const favoritas = (pid = projectId) => `/workspaces/${wsSlug}/projects/${pid}/favorite-pages/`;
  const arquivadas = (pid = projectId) => `/workspaces/${wsSlug}/projects/${pid}/archived-pages/`;

  async function criarPagina(nome: string, extra: Record<string, unknown> = {}) {
    const res = await client.post(paginas(), { name: nome, ...extra });
    expect(res.status).toBe(201);
    return (await res.json()) as any;
  }

  async function json(res: Response) {
    expect(res.status).toBe(200);
    return (await res.json()) as any;
  }

  // ── favorite-pages/ ───────────────────────────────────────────────────────

  it("favoritar devolve 204 e a página passa a constar em favorite-pages", async () => {
    const pagina = await criarPagina("Favoritável");

    const marcada = await client.post(`${favoritas()}${pagina.id}/`, {});
    expect(marcada.status).toBe(204);

    const lista = await json(await client.get(favoritas()));
    expect(lista).toBeInstanceOf(Array);
    expect(lista.map((p: any) => p.id)).toContain(pagina.id);
    expect(lista.find((p: any) => p.id === pagina.id).is_favorite).toBe(true);
  });

  it("is_favorite chega true também no detalhe e na listagem de páginas", async () => {
    const pagina = await criarPagina("Estrelada");
    await client.post(`${favoritas()}${pagina.id}/`, {});

    const detalhe = await json(await client.get(`${paginas()}${pagina.id}/`));
    expect(detalhe.is_favorite).toBe(true);

    const lista = await json(await client.get(paginas()));
    expect(lista.find((p: any) => p.id === pagina.id).is_favorite).toBe(true);
  });

  it("favoritar duas vezes não duplica o registro", async () => {
    const pagina = await criarPagina("Clique Duplo");
    await client.post(`${favoritas()}${pagina.id}/`, {});
    await client.post(`${favoritas()}${pagina.id}/`, {});

    const lista = await json(await client.get(favoritas()));
    expect(lista.filter((p: any) => p.id === pagina.id)).toHaveLength(1);
  });

  it("desfavoritar devolve 204 e tira a página da lista", async () => {
    const pagina = await criarPagina("Desfavoritável");
    await client.post(`${favoritas()}${pagina.id}/`, {});

    const removida = await client.delete(`${favoritas()}${pagina.id}/`);
    expect(removida.status).toBe(204);

    const lista = await json(await client.get(favoritas()));
    expect(lista.map((p: any) => p.id)).not.toContain(pagina.id);
  });

  it("favoritos não vazam entre projetos do mesmo workspace", async () => {
    const pagina = await criarPagina("Só Deste Projeto");
    await client.post(`${favoritas()}${pagina.id}/`, {});

    const outra = await json(await client.get(favoritas(outroProjectId)));
    expect(outra.map((p: any) => p.id)).not.toContain(pagina.id);
  });

  // ── archived-pages/ ───────────────────────────────────────────────────────

  it("arquivar move a página de pages/ para archived-pages/ e apaga o favorito", async () => {
    const pagina = await criarPagina("Vai Para o Arquivo");
    await client.post(`${favoritas()}${pagina.id}/`, {});

    expect((await client.post(`${paginas()}${pagina.id}/archive/`, {})).status).toBe(200);

    const arquivo = await json(await client.get(arquivadas()));
    expect(arquivo).toBeInstanceOf(Array);
    expect(arquivo.map((p: any) => p.id)).toContain(pagina.id);
    expect(arquivo.find((p: any) => p.id === pagina.id).archived_at).not.toBeNull();

    const ativas = await json(await client.get(paginas()));
    expect(ativas.map((p: any) => p.id)).not.toContain(pagina.id);

    const favoritos = await json(await client.get(favoritas()));
    expect(favoritos.map((p: any) => p.id)).not.toContain(pagina.id);
  });

  it("restaurar tira a página de archived-pages/", async () => {
    const pagina = await criarPagina("Volta do Arquivo");
    await client.post(`${paginas()}${pagina.id}/archive/`, {});
    expect((await client.delete(`${paginas()}${pagina.id}/archive/`)).status).toBe(200);

    const arquivo = await json(await client.get(arquivadas()));
    expect(arquivo.map((p: any) => p.id)).not.toContain(pagina.id);
  });

  // ── pages/:page_id/move/ ──────────────────────────────────────────────────

  it("mover troca o vínculo de projeto em vez de acumular vínculos", async () => {
    const pagina = await criarPagina("Mudança de Endereço");

    const movida = await json(await client.post(`${paginas()}${pagina.id}/move/`, { new_project_id: outroProjectId }));
    expect(movida.project_ids).toEqual([outroProjectId]);

    const origem = await json(await client.get(paginas()));
    expect(origem.map((p: any) => p.id)).not.toContain(pagina.id);

    const destino = await json(await client.get(paginas(outroProjectId)));
    expect(destino.map((p: any) => p.id)).toContain(pagina.id);
  });

  it("mover leva a subárvore junto e preserva a hierarquia interna", async () => {
    const pai = await criarPagina("Pai Mudando");
    const filha = await criarPagina("Filha", { parent: pai.id });
    const neta = await criarPagina("Neta", { parent: filha.id });

    await client.post(`${paginas()}${pai.id}/move/`, { new_project_id: outroProjectId });

    const destino = await json(await client.get(paginas(outroProjectId)));
    const porId = new Map(destino.map((p: any) => [p.id, p]));
    expect(porId.has(pai.id)).toBe(true);
    expect(porId.has(filha.id)).toBe(true);
    expect(porId.has(neta.id)).toBe(true);
    expect((porId.get(filha.id) as any).parent_id).toBe(pai.id);
    expect((porId.get(neta.id) as any).parent_id).toBe(filha.id);
  });

  it("mover uma sub-página solta o vínculo com o pai que ficou para trás", async () => {
    const pai = await criarPagina("Pai Que Fica");
    const filha = await criarPagina("Filha Que Sai", { parent: pai.id });

    const movida = await json(await client.post(`${paginas()}${filha.id}/move/`, { new_project_id: outroProjectId }));
    expect(movida.parent_id).toBeNull();

    const origem = await json(await client.get(paginas()));
    expect(origem.map((p: any) => p.id)).toContain(pai.id);
  });

  it("mover sem projeto de destino devolve 400", async () => {
    const pagina = await criarPagina("Sem Destino");
    const res = await client.post(`${paginas()}${pagina.id}/move/`, {});
    expect(res.status).toBe(400);
  });

  it("mover para projeto de outro workspace devolve 404", async () => {
    const estranho = await createUser({ email: "wiki-estranho@plane.test" });
    const outroWs = await createWorkspace(estranho.id);
    const projetoAlheio = await createProject(outroWs.id, estranho.id, { identifier: "ALHE" });

    const pagina = await criarPagina("Não Sai do Workspace");
    const res = await client.post(`${paginas()}${pagina.id}/move/`, { new_project_id: projetoAlheio.id });
    expect(res.status).toBe(404);
  });

  it("quem não é dono nem administrador não move a página", async () => {
    const pagina = await criarPagina("Alheia");
    const { token } = await createMemberWithToken(wsId, 15, projectId, 15);
    const membro = apiClient(token);

    const res = await membro.post(`${paginas()}${pagina.id}/move/`, { new_project_id: outroProjectId });
    expect(res.status).toBe(403);
  });

  // ── pages/:page_id/mentions/ ──────────────────────────────────────────────

  it("mentions devolve os usuários citados no conteúdo, na ordem do texto", async () => {
    const citado = await createUser({ email: "wiki-citado@plane.test", displayName: "Pessoa Citada" });
    await addMember(wsId, citado.id, 15, projectId, 15);

    const html =
      `<p>oi <mention-component id="1" entity_identifier="${citado.id}" entity_name="user_mention"></mention-component>` +
      ` e <mention-component id="2" entity_identifier="${donoId}" entity_name="user_mention"></mention-component></p>`;
    const pagina = await criarPagina("Com Menções", { description_html: html });

    const mencoes = await json(await client.get(`${paginas()}${pagina.id}/mentions/?mention_type=user_mention`));
    expect(mencoes).toBeInstanceOf(Array);
    expect(mencoes.map((m: any) => m.id)).toEqual([citado.id, donoId]);
    expect(mencoes[0].display_name).toBe("Pessoa Citada");
  });

  it("mentions ignora menções que não são de usuário e não repete o mesmo id", async () => {
    const html =
      `<p><mention-component id="1" entity_identifier="${donoId}" entity_name="user_mention"></mention-component>` +
      `<mention-component id="1" entity_identifier="${donoId}" entity_name="user_mention"></mention-component>` +
      `<mention-component id="3" entity_identifier="${projectId}" entity_name="issue_mention"></mention-component></p>`;
    const pagina = await criarPagina("Menções Mistas", { description_html: html });

    const mencoes = await json(await client.get(`${paginas()}${pagina.id}/mentions/`));
    expect(mencoes.map((m: any) => m.id)).toEqual([donoId]);
  });

  it("página sem menção devolve lista vazia", async () => {
    const pagina = await criarPagina("Sem Menção");
    const mencoes = await json(await client.get(`${paginas()}${pagina.id}/mentions/`));
    expect(mencoes).toEqual([]);
  });

  // ── pages/:page_id/description/ (binário Yjs) ─────────────────────────────

  /** Todos os 256 valores possíveis: prova que nada é perdido em UTF-8. */
  const BINARIO = new Uint8Array(Array.from({ length: 256 }, (_, i) => i));
  const BINARIO_B64 = Buffer.from(BINARIO).toString("base64");

  async function bytes(res: Response) {
    expect(res.status).toBe(200);
    return new Uint8Array(await res.arrayBuffer());
  }

  it("página nova devolve corpo vazio — o live remonta o Yjs a partir do HTML", async () => {
    const pagina = await criarPagina("Sem Binário");
    const corpo = await bytes(await client.get(`${paginas()}${pagina.id}/description/`));
    expect(corpo.byteLength).toBe(0);
  });

  it("PATCH grava o binário em base64 e o GET devolve os mesmos bytes", async () => {
    const pagina = await criarPagina("Com Binário");

    const gravou = await client.patch(`${paginas()}${pagina.id}/description/`, {
      description_binary: BINARIO_B64,
      description_html: "<p>conteúdo</p>",
      description_json: { type: "doc" },
    });
    expect(gravou.status).toBe(204);

    const res = await client.get(`${paginas()}${pagina.id}/description/`);
    expect(res.headers.get("content-type")).toContain("application/octet-stream");
    expect(Array.from(await bytes(res))).toEqual(Array.from(BINARIO));

    const detalhe = await json(await client.get(`${paginas()}${pagina.id}/`));
    expect(detalhe.description_html).toBe("<p>conteúdo</p>");
  });

  it("POST em description/ grava igual ao PATCH", async () => {
    const pagina = await criarPagina("Binário Via POST");

    const gravou = await client.post(`${paginas()}${pagina.id}/description/`, {
      description_binary: BINARIO_B64,
      description_html: "<p>via post</p>",
    });
    expect(gravou.status).toBe(204);

    const corpo = await bytes(await client.get(`${paginas()}${pagina.id}/description/`));
    expect(Array.from(corpo)).toEqual(Array.from(BINARIO));
  });

  it("atualizar só o HTML não apaga o binário já gravado", async () => {
    const pagina = await criarPagina("Binário Preservado");
    await client.patch(`${paginas()}${pagina.id}/description/`, { description_binary: BINARIO_B64 });
    await client.patch(`${paginas()}${pagina.id}/description/`, { description_html: "<p>só texto</p>" });

    const corpo = await bytes(await client.get(`${paginas()}${pagina.id}/description/`));
    expect(corpo.byteLength).toBe(BINARIO.byteLength);
  });

  it("página bloqueada recusa a gravação de conteúdo de quem não a administra", async () => {
    const pagina = await criarPagina("Trancada");
    await client.post(`${paginas()}${pagina.id}/lock/`, {});

    const { token } = await createMemberWithToken(wsId, 15, projectId, 15);
    const res = await apiClient(token).patch(`${paginas()}${pagina.id}/description/`, {
      description_binary: BINARIO_B64,
    });
    expect(res.status).toBe(403);
  });
});
