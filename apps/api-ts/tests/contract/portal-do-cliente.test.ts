/**
 * Portal do cliente: entrar, abrir solicitação e acompanhar o que abriu.
 *
 * Três garantias que o portal precisa dar, e que este arquivo cobra:
 *
 *  1. A conta do portal NÃO é usuário do Plane — o crachá dela não abre rota
 *     autenticada do produto.
 *  2. Solicitação nasce na TRIAGEM do projeto, como qualquer entrada externa.
 *  3. Cada conta lê só o que ela mesma abriu.
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
  };
}

describe("Portal do cliente", () => {
  let admin: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let projetoId: string;
  let outroProjetoId: string;
  let contaId: string;
  let token: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    const apiToken = await createApiToken(user.id);
    admin = apiClient(apiToken.token);
    const ws = await createWorkspace(user.id);
    wsSlug = ws.slug;
    projetoId = (await createProject(ws.id, user.id, { name: "SIART", identifier: "SIART" })).id;
    outroProjetoId = (await createProject(ws.id, user.id, { name: "Contábil", identifier: "CONTAB" })).id;

    const criada = await admin.post(`/workspaces/${wsSlug}/portal-accounts/`, {
      name: "Prefeitura de Teste",
      email: "cliente@prefeitura.test",
      password: SENHA,
      project_ids: [projetoId],
    });
    contaId = ((await criada.json()) as any).id;
  });

  afterAll(() => cleanDb());

  it("recusa e-mail ou senha errados sem dizer qual dos dois", async () => {
    const res = await portalClient().post("/entrar", {
      workspace: wsSlug,
      email: "cliente@prefeitura.test",
      senha: "errada",
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as any).detail).toBe("E-mail ou senha inválidos.");
  });

  it("entra com e-mail e senha e devolve o crachá do portal", async () => {
    const res = await portalClient().post("/entrar", {
      workspace: wsSlug,
      email: "cliente@prefeitura.test",
      senha: SENHA,
    });
    expect(res.status).toBe(200);
    const dados = (await res.json()) as any;
    expect(dados.token).toBeTruthy();
    expect(dados.conta.nome).toBe("Prefeitura de Teste");
    token = dados.token;
  });

  it("o crachá do portal não abre rota autenticada do Plane", async () => {
    const res = await fetch(`${TEST_API_BASE_URL}/api/v1/workspaces/${wsSlug}/projects/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  it("lista só os sistemas liberados para a conta", async () => {
    const res = await portalClient(token).get("/sistemas");
    const dados = (await res.json()) as any;
    expect(dados.results.map((s: any) => s.id)).toEqual([projetoId]);
  });

  it("recusa abrir solicitação em sistema não liberado", async () => {
    const res = await portalClient(token).post("/solicitacoes", {
      sistema_id: outroProjetoId,
      titulo: "Não deveria entrar",
    });
    expect(res.status).toBe(403);
  });

  it("exige o resumo em uma linha", async () => {
    const res = await portalClient(token).post("/solicitacoes", { sistema_id: projetoId, titulo: "   " });
    expect(res.status).toBe(400);
  });

  it("abre a solicitação na triagem e devolve o código do chamado", async () => {
    const res = await portalClient(token).post("/solicitacoes", {
      sistema_id: projetoId,
      titulo: "Não consigo emitir a segunda via",
      descricao_html: "<p>Dá erro ao clicar em emitir.</p>",
    });
    expect(res.status).toBe(201);
    const solicitacao = (await res.json()) as any;
    expect(solicitacao.situacao).toBe("Em triagem");
    expect(solicitacao.codigo).toStartWith("SIART-");
    expect(solicitacao.codigo).not.toBe("SIART-0");
  });

  it("a solicitação aparece na caixa de triagem do projeto para a equipe", async () => {
    const res = await admin.get(`/workspaces/${wsSlug}/projects/${projetoId}/inbox-issues/`);
    const dados = (await res.json()) as any;
    expect(dados.results.length).toBe(1);
    expect(dados.results[0].source).toBe("portal");
  });

  it("cada conta lê apenas o que ela mesma abriu", async () => {
    const outra = await admin.post(`/workspaces/${wsSlug}/portal-accounts/`, {
      name: "Câmara de Teste",
      email: "camara@teste.test",
      password: SENHA,
      project_ids: [projetoId],
    });
    expect(outra.status).toBe(201);
    const entrada = await portalClient().post("/entrar", {
      workspace: wsSlug,
      email: "camara@teste.test",
      senha: SENHA,
    });
    const tokenDaCamara = ((await entrada.json()) as any).token;

    const minhas = (await (await portalClient(token).get("/solicitacoes")).json()) as any;
    const dela = (await (await portalClient(tokenDaCamara).get("/solicitacoes")).json()) as any;
    expect(minhas.results.length).toBe(1);
    expect(dela.results.length).toBe(0);
  });

  it("conta desativada deixa de entrar na hora", async () => {
    await admin.patch(`/workspaces/${wsSlug}/portal-accounts/${contaId}`, { is_active: false });
    const res = await portalClient(token).get("/solicitacoes");
    expect(res.status).toBe(401);
  });

  it("só administrador do espaço administra as contas do portal", async () => {
    const outro = await createUser();
    const tokenDele = await createApiToken(outro.id);
    const res = await apiClient(tokenDele.token).get(`/workspaces/${wsSlug}/portal-accounts/`);
    expect([401, 403]).toContain(res.status);
  });
});
