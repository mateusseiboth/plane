/**
 * Wiki do espaço de trabalho: páginas SEM sistema vinculado, servidas pela
 * árvore `/workspaces/:slug/pages/` e pelas rotas `/wiki/`.
 *
 * O que este arquivo fixa:
 *  - a árvore do espaço só enxerga página da wiki (página de sistema fica de fora);
 *  - hierarquia: criar filha, mover, reordenar, recusar ciclo e pai de fora;
 *  - arquivar e restaurar levam a subárvore; excluir solta as filhas;
 *  - página privada de outra pessoa não aparece;
 *  - permissões pela matriz (`wiki.view`, `wiki.edit`), com exceção por pessoa;
 *  - versões do conteúdo gravadas por sessão de edição;
 *  - busca da wiki e inclusão das páginas na busca da paleta.
 * Precisa de uma API rodando contra o banco de teste (API_BASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { seedWorkflowRoles } from "@utils/permissions";
import { cleanDb } from "@tests/helpers/setup";
import {
  apiClient,
  createApiToken,
  createMemberWithToken,
  createProject,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

type Cliente = ReturnType<typeof apiClient>;

describe("wiki do espaço de trabalho", () => {
  let slug: string;
  let wsId: string;
  let projectId: string;
  let admin: Cliente;
  let adminId: string;
  let qualidade: Cliente;
  let qualidadeId: string;
  let visualizador: Cliente;
  let atendimento: Cliente;
  let atendimentoId: string;

  beforeAll(async () => {
    await cleanDb();
    const dono = await createUser({ email: "wiki-admin@plane.test", displayName: "Admin da Wiki" });
    adminId = dono.id;
    const ws = await createWorkspace(dono.id);
    slug = ws.slug;
    wsId = ws.id;
    projectId = (await createProject(ws.id, dono.id, { identifier: "WIKIP" })).id;
    await seedWorkflowRoles(prisma, ws.id);
    admin = apiClient((await createApiToken(dono.id)).token);
    const q = await createMemberWithToken(ws.id, 8, projectId, 8);
    qualidade = apiClient(q.token);
    qualidadeId = q.user.id;
    visualizador = apiClient((await createMemberWithToken(ws.id, 5, projectId, 5)).token);
    const a = await createMemberWithToken(ws.id, 6, projectId, 6);
    atendimento = apiClient(a.token);
    atendimentoId = a.user.id;
  });

  afterAll(() => cleanDb());

  const paginas = () => `/workspaces/${slug}/pages/`;
  const arvore = () => `/workspaces/${slug}/wiki/pages/`;
  const buscaDaWiki = (termo: string) => `/workspaces/${slug}/wiki/search/?search=${encodeURIComponent(termo)}`;

  async function criar(cliente: Cliente, corpo: Record<string, unknown>) {
    const res = await cliente.post(paginas(), corpo);
    expect(res.status).toBe(201);
    return (await res.json()) as any;
  }

  async function json(res: Response) {
    expect(res.status).toBe(200);
    return (await res.json()) as any;
  }

  async function idsDaArvore(cliente: Cliente = admin): Promise<string[]> {
    return (await json(await cliente.get(arvore()))).map((p: any) => p.id);
  }

  // ── árvore ────────────────────────────────────────────────────────────────

  it("a árvore devolve lista simples com parent_id e sort_order, só páginas da wiki", async () => {
    const wiki = await criar(admin, { name: "Manual" });
    const res = await admin.post(`/workspaces/${slug}/projects/${projectId}/pages/`, { name: "Do Sistema" });
    const doSistema = (await res.json()) as any;

    const lista = await json(await admin.get(arvore()));
    expect(lista).toBeInstanceOf(Array);
    const ids = lista.map((p: any) => p.id);
    expect(ids).toContain(wiki.id);
    expect(ids).not.toContain(doSistema.id);
    const manual = lista.find((p: any) => p.id === wiki.id);
    expect(manual.parent_id).toBeNull();
    expect(typeof manual.sort_order).toBe("number");
    expect(manual.project_ids).toEqual([]);
  });

  it("página de sistema não é alcançável pela árvore do espaço", async () => {
    const res = await admin.post(`/workspaces/${slug}/projects/${projectId}/pages/`, { name: "Só no Sistema" });
    const doSistema = (await res.json()) as any;
    expect((await admin.get(`${paginas()}${doSistema.id}/`)).status).toBe(404);
    expect((await admin.patch(`${paginas()}${doSistema.id}/`, { name: "x" })).status).toBe(404);
  });

  it("criar ignora project_ids do corpo: página da wiki nunca nasce vinculada a sistema", async () => {
    const pagina = await criar(admin, { name: "Sem Vínculo", project_ids: [projectId] });
    expect(pagina.project_ids).toEqual([]);
  });

  it("criar filha grava o pai e ela entra depois das irmãs", async () => {
    const pai = await criar(admin, { name: "Processos" });
    const primeira = await criar(admin, { name: "Primeira", parent_id: pai.id });
    const segunda = await criar(admin, { name: "Segunda", parent: pai.id });
    expect(primeira.parent_id).toBe(pai.id);
    expect(segunda.parent_id).toBe(pai.id);
    expect(segunda.sort_order).toBeGreaterThan(primeira.sort_order);
  });

  it("pai de outro espaço ou de sistema é recusado com 400", async () => {
    const res = await admin.post(`/workspaces/${slug}/projects/${projectId}/pages/`, { name: "Pai de Sistema" });
    const paiDeSistema = (await res.json()) as any;
    expect((await admin.post(paginas(), { name: "Filha", parent_id: paiDeSistema.id })).status).toBe(400);
  });

  it("mover para outro pai e reordenar pelo PATCH", async () => {
    const a = await criar(admin, { name: "A" });
    const b = await criar(admin, { name: "B" });
    const filha = await criar(admin, { name: "Filha de A", parent_id: a.id });

    const movida = await json(await admin.patch(`${paginas()}${filha.id}/`, { parent_id: b.id, sort_order: 10 }));
    expect(movida.parent_id).toBe(b.id);
    expect(movida.sort_order).toBe(10);

    const raiz = await json(await admin.patch(`${paginas()}${filha.id}/`, { parent_id: null }));
    expect(raiz.parent_id).toBeNull();
  });

  it("a árvore sai ordenada por sort_order", async () => {
    const pai = await criar(admin, { name: "Ordenado" });
    const x = await criar(admin, { name: "X", parent_id: pai.id });
    const y = await criar(admin, { name: "Y", parent_id: pai.id });
    await admin.patch(`${paginas()}${y.id}/`, { sort_order: 1 });

    const irmas = (await json(await admin.get(arvore()))).filter((p: any) => p.parent_id === pai.id);
    expect(irmas.map((p: any) => p.id)).toEqual([y.id, x.id]);
  });

  it("mover a página para dentro dela mesma ou de uma descendente é recusado", async () => {
    const avo = await criar(admin, { name: "Avó" });
    const mae = await criar(admin, { name: "Mãe", parent_id: avo.id });
    const neta = await criar(admin, { name: "Neta", parent_id: mae.id });

    expect((await admin.patch(`${paginas()}${avo.id}/`, { parent_id: avo.id })).status).toBe(400);
    expect((await admin.patch(`${paginas()}${avo.id}/`, { parent_id: neta.id })).status).toBe(400);
  });

  it("arquivar leva a subárvore e restaurar traz de volta", async () => {
    const pai = await criar(admin, { name: "Arquivo Pai" });
    const filha = await criar(admin, { name: "Arquivo Filha", parent_id: pai.id });

    expect((await admin.post(`${paginas()}${pai.id}/archive/`, {})).status).toBe(200);
    const ativas = await idsDaArvore();
    expect(ativas).not.toContain(pai.id);
    expect(ativas).not.toContain(filha.id);
    const arquivadas = (await json(await admin.get(`/workspaces/${slug}/archived-pages/`))).map((p: any) => p.id);
    expect(arquivadas).toContain(filha.id);

    expect((await admin.delete(`${paginas()}${pai.id}/archive/`)).status).toBe(200);
    const devolta = await idsDaArvore();
    expect(devolta).toContain(pai.id);
    expect(devolta).toContain(filha.id);
  });

  it("restaurar a filha de um pai ainda arquivado solta ela do pai", async () => {
    const pai = await criar(admin, { name: "Pai Guardado" });
    const filha = await criar(admin, { name: "Filha Solta", parent_id: pai.id });
    await admin.post(`${paginas()}${pai.id}/archive/`, {});

    const restaurada = await json(await admin.delete(`${paginas()}${filha.id}/archive/`));
    expect(restaurada.parent_id).toBeNull();
    expect(await idsDaArvore()).toContain(filha.id);
  });

  it("excluir a página solta as filhas em vez de sumir com elas", async () => {
    const pai = await criar(admin, { name: "Vai Sumir" });
    const filha = await criar(admin, { name: "Fica", parent_id: pai.id });

    expect((await admin.delete(`${paginas()}${pai.id}/`)).status).toBe(204);
    const lista = await json(await admin.get(arvore()));
    expect(lista.find((p: any) => p.id === filha.id).parent_id).toBeNull();
  });

  it("página privada de outra pessoa não aparece na árvore nem abre", async () => {
    const privada = await criar(qualidade, { name: "Rascunho Pessoal", access: 1 });
    expect(await idsDaArvore(qualidade)).toContain(privada.id);
    expect(await idsDaArvore(admin)).not.toContain(privada.id);
    expect((await admin.get(`${paginas()}${privada.id}/`)).status).toBe(404);
  });

  // ── permissões ────────────────────────────────────────────────────────────

  it("Visualizador lê a wiki mas não escreve", async () => {
    const pagina = await criar(admin, { name: "Leitura" });
    expect((await visualizador.get(arvore())).status).toBe(200);
    expect((await visualizador.get(`${paginas()}${pagina.id}/`)).status).toBe(200);
    expect((await visualizador.post(paginas(), { name: "Não pode" })).status).toBe(403);
    expect((await visualizador.patch(`${paginas()}${pagina.id}/`, { name: "Não pode" })).status).toBe(403);
    expect(
      (await visualizador.patch(`${paginas()}${pagina.id}/description/`, { description_html: "<p>x</p>" })).status
    ).toBe(403);
  });

  it("Qualidade escreve na wiki; Atendimento não", async () => {
    expect((await qualidade.post(paginas(), { name: "Da Qualidade" })).status).toBe(201);
    expect((await atendimento.post(paginas(), { name: "Do Atendimento" })).status).toBe(403);
  });

  it("concessão por pessoa libera a escrita", async () => {
    await prisma.workspaceMember.updateMany({
      where: { workspaceId: wsId, memberId: atendimentoId },
      data: { grantedActions: ["wiki.edit"] },
    });
    expect((await atendimento.post(paginas(), { name: "Concedida" })).status).toBe(201);
    await prisma.workspaceMember.updateMany({
      where: { workspaceId: wsId, memberId: atendimentoId },
      data: { grantedActions: [] },
    });
  });

  it("negação de wiki.view por pessoa bloqueia a leitura", async () => {
    await prisma.workspaceMember.updateMany({
      where: { workspaceId: wsId, memberId: qualidadeId },
      data: { revokedActions: ["wiki.view"] },
    });
    expect((await qualidade.get(arvore())).status).toBe(403);
    expect((await qualidade.get(buscaDaWiki("manual"))).status).toBe(403);
    await prisma.workspaceMember.updateMany({
      where: { workspaceId: wsId, memberId: qualidadeId },
      data: { revokedActions: [] },
    });
  });

  // ── versões ───────────────────────────────────────────────────────────────

  it("gravar o conteúdo guarda a versão anterior, uma por sessão de edição", async () => {
    const pagina = await criar(admin, { name: "Versionada", description_html: "<p>um</p>" });
    const conteudo = `${paginas()}${pagina.id}/description/`;
    const versoes = `${paginas()}${pagina.id}/versions/`;

    expect((await admin.patch(conteudo, { description_html: "<p>dois</p>" })).status).toBe(204);
    expect((await admin.patch(conteudo, { description_html: "<p>três</p>" })).status).toBe(204);
    const umaSessao = await json(await admin.get(versoes));
    expect(umaSessao).toHaveLength(1);
    expect(umaSessao[0].description_html).toBe("<p>um</p>");
    expect(umaSessao[0].owned_by).toBe(adminId);

    expect((await qualidade.patch(conteudo, { description_html: "<p>quatro</p>" })).status).toBe(204);
    const duasSessoes = await json(await admin.get(versoes));
    expect(duasSessoes).toHaveLength(2);
    expect(duasSessoes[0].description_html).toBe("<p>três</p>");
    expect(duasSessoes[0].owned_by).toBe(qualidadeId);

    const detalhe = await json(await admin.get(`${versoes}${duasSessoes[1].id}/`));
    expect(detalhe.description_html).toBe("<p>um</p>");
  });

  it("reenviar o mesmo conteúdo não abre versão", async () => {
    const pagina = await criar(admin, { name: "Sem Mudança", description_html: "<p>igual</p>" });
    await admin.patch(`${paginas()}${pagina.id}/description/`, { description_html: "<p>igual</p>" });
    expect(await json(await admin.get(`${paginas()}${pagina.id}/versions/`))).toHaveLength(0);
  });

  // ── busca ─────────────────────────────────────────────────────────────────

  it("a busca da wiki acha pelo conteúdo, sem acento e com radical", async () => {
    const pagina = await criar(admin, {
      name: "Procedimento de Implantação",
      description_html: "<p>Configurar a emissão de certidões negativas</p>",
    });
    const achados = await json(await admin.get(buscaDaWiki("emissao negativa")));
    expect(achados.map((p: any) => p.id)).toContain(pagina.id);
    expect(achados[0]).toHaveProperty("name");
    expect(achados[0]).toHaveProperty("parent_id");

    const peloTitulo = await json(await admin.get(buscaDaWiki("implantacao")));
    expect(peloTitulo.map((p: any) => p.id)).toContain(pagina.id);
  });

  it("a busca da wiki não devolve página de sistema nem arquivada", async () => {
    await admin.post(`/workspaces/${slug}/projects/${projectId}/pages/`, { name: "Zebra de Sistema" });
    const arquivada = await criar(admin, { name: "Zebra Arquivada" });
    await admin.post(`${paginas()}${arquivada.id}/archive/`, {});
    const achados = await json(await admin.get(buscaDaWiki("zebra")));
    expect(achados).toEqual([]);
  });

  it("a paleta (/search/) inclui páginas da wiki e as do sistema de quem participa", async () => {
    const wiki = await criar(admin, { name: "Girafa da Wiki" });
    const res = await admin.post(`/workspaces/${slug}/projects/${projectId}/pages/`, { name: "Girafa do Sistema" });
    const doSistema = (await res.json()) as any;

    const corpo = await json(await admin.get(`/workspaces/${slug}/search/?search=girafa`));
    const achadas = corpo.results.page;
    const daWiki = achadas.find((p: any) => p.id === wiki.id);
    expect(daWiki).toMatchObject({ project_ids: [], project__identifiers: [], workspace__slug: slug });
    const deSistema = achadas.find((p: any) => p.id === doSistema.id);
    expect(deSistema.project_ids).toEqual([projectId]);
    expect(deSistema.project__identifiers).toEqual(["WIKIP"]);
  });

  it("sem wiki.view a paleta não mostra página da wiki", async () => {
    await criar(admin, { name: "Ornitorrinco" });
    await prisma.workspaceMember.updateMany({
      where: { workspaceId: wsId, memberId: qualidadeId },
      data: { revokedActions: ["wiki.view"] },
    });
    const corpo = await json(await qualidade.get(`/workspaces/${slug}/search/?search=ornitorrinco`));
    expect(corpo.results.page).toEqual([]);
    await prisma.workspaceMember.updateMany({
      where: { workspaceId: wsId, memberId: qualidadeId },
      data: { revokedActions: [] },
    });
  });
});
