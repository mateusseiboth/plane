/**
 * Portal do cliente: texto com formatação e anexos.
 *
 * O que este arquivo cobra, e por quê:
 *
 *  1. O cliente escreve com formatação — negrito, lista, link — e isso chega
 *     inteiro no chamado. O que ele NÃO consegue mandar é script, evento de
 *     clique ou `javascript:`: o texto é limpo no servidor antes de virar
 *     chamado, porque quem digita ali é gente de fora.
 *  2. O anexo do cliente vira anexo do chamado — o mesmo `issue_attachments`
 *     que a equipe já lê, no mesmo lugar da tela.
 *  3. Upload é superfície hostil: tipo fora da lista, arquivo acima do teto e
 *     excesso de arquivos por solicitação são recusados com o motivo em
 *     português.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import {
  apiClient,
  createApiToken,
  createProject,
  createUser,
  createWorkspace,
  TEST_API_BASE_URL,
} from "@tests/helpers/factory";

const SENHA = "portal-secreto-123";

/** PNG de 1x1 de verdade: a assinatura do arquivo é conferida no servidor. */
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49,
  0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00,
  0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

/** MP4 mínimo: `....ftypisom` — o suficiente para a conferência de assinatura. */
const MP4 = Uint8Array.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00, 0x69, 0x73, 0x6f,
  0x6d, 0x69, 0x73, 0x6f, 0x32,
]);

function pngComTamanho(bytes: number): Blob {
  const enchimento = new Uint8Array(Math.max(0, bytes - PNG.length));
  return new Blob([PNG, enchimento], { type: "image/png" });
}

/** Cliente HTTP do portal: token próprio no Authorization, nada de X-Api-Key. */
function portalClient(token = "") {
  const base = `${TEST_API_BASE_URL}/portal/api`;
  const cabecalhos = () => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });
  return {
    get: (caminho: string) => fetch(`${base}${caminho}`, { headers: cabecalhos() }),
    post: (caminho: string, body: unknown) =>
      fetch(`${base}${caminho}`, { method: "POST", headers: cabecalhos(), body: JSON.stringify(body) }),
    /** Multipart: o Content-Type sai do FormData, não pode ser fixado à mão. */
    anexar: (caminho: string, arquivo: Blob, nome: string) => {
      const formulario = new FormData();
      formulario.append("arquivo", arquivo, nome);
      return fetch(`${base}${caminho}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formulario,
      });
    },
  };
}

describe("Portal do cliente — texto rico e anexos", () => {
  let admin: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let projetoId: string;
  let token: string;
  let solicitacaoId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    const apiToken = await createApiToken(user.id);
    admin = apiClient(apiToken.token);
    const ws = await createWorkspace(user.id);
    wsSlug = ws.slug;
    projetoId = (await createProject(ws.id, user.id, { name: "Almoxarifado", identifier: "ALMOXA" })).id;

    await admin.post(`/workspaces/${wsSlug}/portal-accounts/`, {
      name: "Prefeitura de Teste",
      email: "anexos@prefeitura.test",
      password: SENHA,
      project_ids: [projetoId],
    });
    const entrada = await portalClient().post("/entrar", {
      workspace: wsSlug,
      email: "anexos@prefeitura.test",
      senha: SENHA,
    });
    token = ((await entrada.json()) as any).token;
  });

  afterAll(() => cleanDb());

  // ── Texto com formatação ──────────────────────────────────────────────────

  it("guarda a formatação que o cliente escreveu", async () => {
    const res = await portalClient(token).post("/solicitacoes", {
      sistema_id: projetoId,
      titulo: "Erro ao emitir a segunda via",
      descricao_html:
        "<p>Acontece <strong>toda</strong> vez que eu clico em <em>emitir</em>.</p>" +
        "<ul><li>Passo um</li><li>Passo dois</li></ul>" +
        '<p><a href="https://prefeitura.gov.br/iptu">A tela é esta</a></p>',
    });
    expect(res.status).toBe(201);
    const solicitacao = (await res.json()) as any;
    solicitacaoId = solicitacao.id;
    expect(solicitacao.descricao_html).toContain("<strong>toda</strong>");
    expect(solicitacao.descricao_html).toContain("<li>Passo um</li>");
    expect(solicitacao.descricao_html).toContain('href="https://prefeitura.gov.br/iptu"');
  });

  it("descarta script, evento de clique e javascript: do texto do cliente", async () => {
    const res = await portalClient(token).post("/solicitacoes", {
      sistema_id: projetoId,
      titulo: "Tentativa de script",
      descricao_html:
        '<p onclick="roubar()">Olá</p><script>alert(1)</script>' +
        '<p><a href="javascript:alert(2)">clique</a></p><img src="x" onerror="alert(3)" />',
    });
    expect(res.status).toBe(201);
    const html = ((await res.json()) as any).descricao_html as string;
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("Olá");
    // O texto do link continua legível mesmo com o endereço recusado.
    expect(html).toContain("clique");
  });

  it("a equipe recebe o mesmo texto formatado no chamado", async () => {
    const res = await admin.get(`/workspaces/${wsSlug}/projects/${projetoId}/issues/${solicitacaoId}/`);
    expect(res.status).toBe(200);
    const chamado = (await res.json()) as any;
    expect(chamado.description_html).toContain("<strong>toda</strong>");
  });

  // ── Anexos ────────────────────────────────────────────────────────────────

  it("aceita imagem e devolve o anexo da solicitação", async () => {
    const res = await portalClient(token).anexar(
      `/solicitacoes/${solicitacaoId}/anexos`,
      new Blob([PNG], { type: "image/png" }),
      "tela-do-erro.png"
    );
    expect(res.status).toBe(201);
    const anexo = (await res.json()) as any;
    expect(anexo.nome).toBe("tela-do-erro.png");
    expect(anexo.tipo).toBe("image/png");
    expect(anexo.tamanho).toBe(PNG.length);
  });

  it("aceita vídeo", async () => {
    const res = await portalClient(token).anexar(
      `/solicitacoes/${solicitacaoId}/anexos`,
      new Blob([MP4], { type: "video/mp4" }),
      "gravacao.mp4"
    );
    expect(res.status).toBe(201);
    expect(((await res.json()) as any).tipo).toBe("video/mp4");
  });

  it("o anexo aparece no chamado, onde a equipe já vê anexos", async () => {
    const res = await admin.get(
      `/assets/v2/workspaces/${wsSlug}/projects/${projetoId}/issues/${solicitacaoId}/attachments/`
    );
    expect(res.status).toBe(200);
    const lista = (await res.json()) as any;
    const anexos: any[] = Array.isArray(lista) ? lista : lista.results;
    expect(anexos.map((a) => a.attributes?.name).toSorted()).toEqual(["gravacao.mp4", "tela-do-erro.png"]);
    // Sem endereço não há como a equipe abrir o arquivo.
    expect(anexos.every((a) => Boolean(a.asset_url))).toBe(true);

    // E o endereço tem de servir o arquivo de verdade. O `/api/` do navegador
    // vira `/api/v1/` no proxy (ver apps/proxy-ts/nginx.conf).
    const imagem = anexos.find((a) => a.attributes?.name === "tela-do-erro.png");
    const arquivo = await admin.get(String(imagem.asset_url).replace(/^\/api\//, "/"));
    expect(arquivo.status).toBe(200);
    expect((await arquivo.arrayBuffer()).byteLength).toBe(PNG.length);
  });

  it("o cliente vê os próprios anexos na solicitação", async () => {
    const res = await portalClient(token).get(`/solicitacoes/${solicitacaoId}`);
    const solicitacao = (await res.json()) as any;
    expect(solicitacao.anexos.length).toBe(2);
    expect(solicitacao.anexos[0].nome).toBeTruthy();
  });

  it("baixa o anexo que o próprio cliente enviou", async () => {
    const solicitacao = (await (await portalClient(token).get(`/solicitacoes/${solicitacaoId}`)).json()) as any;
    const anexo = solicitacao.anexos.find((a: any) => a.nome === "tela-do-erro.png");
    const res = await fetch(`${TEST_API_BASE_URL}/portal/api/solicitacoes/${solicitacaoId}/anexos/${anexo.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect((await res.arrayBuffer()).byteLength).toBe(PNG.length);
  });

  // ── Superfície hostil ─────────────────────────────────────────────────────

  it("recusa executável", async () => {
    const res = await portalClient(token).anexar(
      `/solicitacoes/${solicitacaoId}/anexos`,
      new Blob([new Uint8Array([0x4d, 0x5a, 0x90, 0x00])], { type: "application/x-msdownload" }),
      "virus.exe"
    );
    expect(res.status).toBe(415);
    expect(((await res.json()) as any).detail).toContain("não aceito");
  });

  it("recusa SVG e HTML, que executam script no navegador", async () => {
    const svg = await portalClient(token).anexar(
      `/solicitacoes/${solicitacaoId}/anexos`,
      new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], { type: "image/svg+xml" }),
      "desenho.svg"
    );
    expect(svg.status).toBe(415);
    const html = await portalClient(token).anexar(
      `/solicitacoes/${solicitacaoId}/anexos`,
      new Blob(["<html><body>oi</body></html>"], { type: "text/html" }),
      "pagina.html"
    );
    expect(html.status).toBe(415);
  });

  it("recusa arquivo cuja extensão mente sobre o conteúdo", async () => {
    const res = await portalClient(token).anexar(
      `/solicitacoes/${solicitacaoId}/anexos`,
      new Blob([new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03])], { type: "image/png" }),
      "disfarcado.png"
    );
    expect(res.status).toBe(415);
  });

  it("recusa arquivo acima do teto", async () => {
    const res = await portalClient(token).anexar(
      `/solicitacoes/${solicitacaoId}/anexos`,
      pngComTamanho(26 * 1024 * 1024),
      "gigante.png"
    );
    expect(res.status).toBe(413);
    expect(((await res.json()) as any).detail).toContain("MB");
  });

  it("recusa passar do limite de arquivos por solicitação", async () => {
    const cliente = portalClient(token);
    const nova = await cliente.post("/solicitacoes", { sistema_id: projetoId, titulo: "Muitos arquivos" });
    const id = ((await nova.json()) as any).id;

    // Um de cada vez, de propósito: o limite é contado no servidor a cada envio.
    for (let n = 1; n <= 5; n++) {
      // oxlint-disable-next-line no-await-in-loop
      const ok = await cliente.anexar(
        `/solicitacoes/${id}/anexos`,
        new Blob([PNG], { type: "image/png" }),
        `f${n}.png`
      );
      expect(ok.status).toBe(201);
    }
    const excedente = await cliente.anexar(
      `/solicitacoes/${id}/anexos`,
      new Blob([PNG], { type: "image/png" }),
      "f6.png"
    );
    expect(excedente.status).toBe(400);
    expect(((await excedente.json()) as any).detail).toContain("5");
  });

  it("uma conta não anexa na solicitação de outra", async () => {
    await admin.post(`/workspaces/${wsSlug}/portal-accounts/`, {
      name: "Câmara de Teste",
      email: "camara-anexos@teste.test",
      password: SENHA,
      project_ids: [projetoId],
    });
    const entrada = await portalClient().post("/entrar", {
      workspace: wsSlug,
      email: "camara-anexos@teste.test",
      senha: SENHA,
    });
    const tokenDaCamara = ((await entrada.json()) as any).token;
    const res = await portalClient(tokenDaCamara).anexar(
      `/solicitacoes/${solicitacaoId}/anexos`,
      new Blob([PNG], { type: "image/png" }),
      "intruso.png"
    );
    expect(res.status).toBe(404);
  });

  it("sem crachá não anexa", async () => {
    const res = await portalClient().anexar(
      `/solicitacoes/${solicitacaoId}/anexos`,
      new Blob([PNG], { type: "image/png" }),
      "sem-cracha.png"
    );
    expect(res.status).toBe(401);
  });
});
