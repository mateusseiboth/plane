/**
 * Sugestões da wiki ao abrir solicitação pelo atendimento.
 *
 * `GET  /workspaces/:slug/wiki/sugestoes/?q=&project_id=`  páginas parecidas com o problema
 * `POST /workspaces/:slug/wiki/sugestoes/resolver/`        o que fazer, escrito pela IA
 *
 * O que este arquivo fixa:
 *  - acha pela palavra do título e pela do corpo, com o relato em texto livre;
 *  - não acha página de outro espaço nem página privada de outra pessoa;
 *  - ordena por relevância e põe na frente as páginas do sistema escolhido;
 *  - `q` vazio devolve lista vazia, sem erro;
 *  - quem não abre solicitação (`intake.create`) recebe 403;
 *  - sem IA no servidor a sugestão vem `null` com o motivo; com IA (falsa,
 *    `Bun.serve` local) vem curta e montada com os trechos das páginas.
 * Precisa de uma API rodando contra o banco de teste (API_BASE_URL); os
 * cenários com IA sobem instâncias próprias.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import prisma from "@db";
import { seedWorkflowRoles } from "@utils/permissions";
import { cleanDb } from "@tests/helpers/setup";
import { startApiDeTeste, type ApiDeTeste } from "@tests/helpers/api-de-teste";
import {
  apiClient,
  createApiToken,
  createMemberWithToken,
  createProject,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

type Cliente = ReturnType<typeof apiClient>;
type Sugestao = { id: string; name: string; project_id: string | null; trecho: string; url: string };

const SUGESTAO_DA_IA = "Reemita a nota pelo menu Tributos, opção Notas emitidas, e confira o certificado digital.";

// ── IA falsa ──────────────────────────────────────────────────────────────────

type ModoIa = "ok" | "erro" | "longa";

function startIaFalsa() {
  const chamadas: { caminho: string; corpo: any }[] = [];
  let modo: ModoIa = "ok";
  const textoDoModo = (): string => (modo === "longa" ? "Faça assim. ".repeat(120) : SUGESTAO_DA_IA);

  const RESPOSTA_POR_CAMINHO: Record<string, () => unknown> = {
    // Formato nativo: a rota devolve a sugestão pronta.
    "/resolver": () => ({ sugestao: textoDoModo() }),
    // OpenAI: JSON dentro de choices[0].message.content.
    "/v1/chat/completions": () => ({
      choices: [{ message: { role: "assistant", content: JSON.stringify({ sugestao: textoDoModo() }) } }],
    }),
  };

  const servidor = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const corpo = await req.json().catch(() => ({}));
      chamadas.push({ caminho: url.pathname, corpo });
      if (modo === "erro") return new Response("modelo caiu", { status: 500 });
      const monta = RESPOSTA_POR_CAMINHO[url.pathname];
      if (!monta) return new Response("caminho desconhecido", { status: 404 });
      return Response.json(monta());
    },
  });

  return {
    base: `http://localhost:${servidor.port}`,
    chamadas,
    setModo: (novo: ModoIa) => {
      modo = novo;
    },
    clear: () => {
      chamadas.length = 0;
      modo = "ok";
    },
    stop: () => servidor.stop(true),
  };
}

// ── Cenário ───────────────────────────────────────────────────────────────────

describe("sugestões da wiki ao abrir solicitação", () => {
  let slug: string;
  let sistemaId: string;
  let outroSistemaId: string;
  let admin: Cliente;
  let atendimento: Cliente;
  let atendimentoToken: string;
  let visualizador: Cliente;
  const paginas: Record<string, string> = {};

  const sugestoes = (q: string, projectId?: string) =>
    `/workspaces/${slug}/wiki/sugestoes/?q=${encodeURIComponent(q)}${projectId ? `&project_id=${projectId}` : ""}`;
  const resolver = () => `/workspaces/${slug}/wiki/sugestoes/resolver/`;

  async function createPagina(nome: string, html: string, extra: Record<string, unknown> = {}, projectId?: string) {
    const caminho = projectId ? `/workspaces/${slug}/projects/${projectId}/pages/` : `/workspaces/${slug}/pages/`;
    const res = await admin.post(caminho, { name: nome, description_html: html, ...extra });
    expect(res.status).toBe(201);
    const pagina = (await res.json()) as any;
    paginas[nome] = pagina.id;
    return pagina.id as string;
  }

  async function readSugestoes(cliente: Cliente, q: string, projectId?: string): Promise<Sugestao[]> {
    const res = await cliente.get(sugestoes(q, projectId));
    expect(res.status).toBe(200);
    return (await res.json()) as Sugestao[];
  }

  beforeAll(async () => {
    await cleanDb();
    const dono = await createUser({ email: "wiki-sugestoes@plane.test" });
    const ws = await createWorkspace(dono.id);
    slug = ws.slug;
    sistemaId = (await createProject(ws.id, dono.id, { identifier: "SIA" })).id;
    outroSistemaId = (await createProject(ws.id, dono.id, { identifier: "TRIB" })).id;
    await seedWorkflowRoles(prisma, ws.id);
    admin = apiClient((await createApiToken(dono.id)).token);
    const a = await createMemberWithToken(ws.id, 6, sistemaId, 6);
    atendimentoToken = a.token;
    atendimento = apiClient(a.token);
    visualizador = apiClient((await createMemberWithToken(ws.id, 5, sistemaId, 5)).token);

    await createPagina(
      "Emissão de nota fiscal eletrônica",
      "<p>Para emitir a nota fiscal eletrônica, abra Tributos e escolha Notas emitidas.</p>"
    );
    await createPagina(
      "Cadastro de produtos",
      "<p>O produto cadastrado aparece na nota quando o código NCM está preenchido.</p>"
    );
    await createPagina(
      "Configuração do assinador",
      "<p>Instale o certificado digital A1 e reinicie o navegador antes de assinar.</p>"
    );
    await createPagina("Boleto vencido", "<p>Para reemitir o boleto com juros, use a segunda via.</p>");
    await createPagina("Nota fiscal no SIA", "<p>No SIA a nota fiscal sai pelo menu Faturamento.</p>", {}, sistemaId);
    await createPagina("Nota fiscal no TRIB", "<p>No TRIB a nota fiscal sai pelo menu Guias.</p>", {}, outroSistemaId);
    // Privada do dono: ninguém mais acha.
    await createPagina("Rascunho sobre nota fiscal", "<p>Anotações pessoais sobre a nota fiscal.</p>", {
      access: 1,
    });

    // Outro espaço, mesma palavra no título: não pode aparecer.
    const outroDono = await createUser();
    const outroEspaco = await createWorkspace(outroDono.id);
    await prisma.page.create({
      data: {
        workspaceId: outroEspaco.id,
        ownedById: outroDono.id,
        name: "Nota fiscal de outro espaço",
        descriptionHtml: "<p>Nota fiscal eletrônica.</p>",
        descriptionStripped: "Nota fiscal eletrônica.",
        access: 0,
      },
    });
    paginas.outroEspaco = (await prisma.page.findFirstOrThrow({ where: { workspaceId: outroEspaco.id } })).id;
  });

  afterAll(() => cleanDb());

  // ── busca ─────────────────────────────────────────────────────────────────

  it("acha pela palavra do título, com o relato em texto livre", async () => {
    const lista = await readSugestoes(atendimento, "o cliente não consegue emitir a nota fiscal eletrônica");
    expect(lista.map((p) => p.name)).toContain("Emissão de nota fiscal eletrônica");
  });

  it("acha pela palavra do corpo", async () => {
    const lista = await readSugestoes(atendimento, "certificado digital não instala no navegador");
    expect(lista.map((p) => p.name)).toContain("Configuração do assinador");
  });

  it("devolve id, nome, sistema, trecho e o endereço da página", async () => {
    const lista = await readSugestoes(atendimento, "certificado digital não instala");
    const assinador = lista.find((p) => p.name === "Configuração do assinador")!;
    expect(assinador).toEqual({
      id: paginas["Configuração do assinador"],
      name: "Configuração do assinador",
      project_id: null,
      trecho: expect.stringContaining("certificado digital"),
      url: `/${slug}/wiki/${paginas["Configuração do assinador"]}`,
    });
    expect(assinador.trecho).not.toContain("<");
  });

  it("não acha página de outro espaço nem a privada de outra pessoa", async () => {
    const lista = await readSugestoes(atendimento, "nota fiscal eletrônica");
    const nomes = lista.map((p) => p.name);
    expect(nomes).not.toContain("Nota fiscal de outro espaço");
    expect(nomes).not.toContain("Rascunho sobre nota fiscal");
  });

  it("não mostra página de sistema de que a pessoa não participa", async () => {
    const lista = await readSugestoes(atendimento, "nota fiscal menu");
    expect(lista.map((p) => p.name)).not.toContain("Nota fiscal no TRIB");
  });

  it("ordena por relevância: quem casa mais termos e no título vem antes", async () => {
    const lista = await readSugestoes(atendimento, "emissão de nota fiscal eletrônica");
    const nomes = lista.map((p) => p.name);
    expect(nomes[0]).toBe("Emissão de nota fiscal eletrônica");
    expect(nomes.indexOf("Emissão de nota fiscal eletrônica")).toBeLessThan(nomes.indexOf("Cadastro de produtos"));
  });

  it("com o sistema escolhido, as páginas dele vêm primeiro e abrem nele", async () => {
    const lista = await readSugestoes(atendimento, "emissão de nota fiscal eletrônica", sistemaId);
    expect(lista[0]).toMatchObject({
      name: "Nota fiscal no SIA",
      project_id: sistemaId,
      url: `/${slug}/projects/${sistemaId}/pages/${paginas["Nota fiscal no SIA"]}`,
    });
  });

  it("devolve no máximo 5 páginas", async () => {
    const lista = await readSugestoes(admin, "nota fiscal produto certificado boleto emissão");
    expect(lista.length).toBeLessThanOrEqual(5);
  });

  it("q vazio, ausente ou só com palavras vazias devolve lista vazia, sem erro", async () => {
    expect(await readSugestoes(atendimento, "")).toEqual([]);
    expect(await readSugestoes(atendimento, "o de a que para")).toEqual([]);
    const semQ = await atendimento.get(`/workspaces/${slug}/wiki/sugestoes/`);
    expect(semQ.status).toBe(200);
    expect(await semQ.json()).toEqual([]);
  });

  it("quem não abre solicitação não consulta", async () => {
    const res = await visualizador.get(sugestoes("nota fiscal"));
    expect(res.status).toBe(403);
  });

  // ── sugestão sem IA ───────────────────────────────────────────────────────

  it("sem IA no servidor, a sugestão vem nula com o motivo", async () => {
    const res = await atendimento.post(resolver(), {
      texto: "cliente não emite nota fiscal",
      paginas: [paginas["Emissão de nota fiscal eletrônica"]],
    });
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as any;
    expect(corpo.sugestao).toBeNull();
    expect(typeof corpo.motivo).toBe("string");
    expect(corpo.motivo).not.toContain("—");
  });

  it("quem não abre solicitação não pede sugestão", async () => {
    const res = await visualizador.post(resolver(), { texto: "nota", paginas: [] });
    expect(res.status).toBe(403);
  });

  // ── sugestão com IA ───────────────────────────────────────────────────────

  describe("com a IA configurada", () => {
    const ia = startIaFalsa();
    const apis: Record<string, ApiDeTeste> = {};
    const naApi = (nome: string) => apiClient(atendimentoToken, apis[nome].base);

    beforeAll(async () => {
      const comum = {
        IA_REQUISITOS_URL: ia.base,
        IA_REQUISITOS_CHAVE: "chave-falsa",
        IA_REQUISITOS_TIMEOUT_MS: "1500",
      };
      const [openai, aviao] = await Promise.all([
        startApiDeTeste("wiki-ia-openai", { ...comum, IA_REQUISITOS_FORMATO: "openai" }),
        startApiDeTeste("wiki-ia-aviao", { ...comum, IA_REQUISITOS_FORMATO: "aviao" }),
      ]);
      apis.openai = openai;
      apis.aviao = aviao;
    });

    beforeEach(() => ia.clear());

    afterAll(() => {
      Object.values(apis).forEach((api) => api.parar());
      ia.stop();
    });

    const pedido = () => ({
      texto: "O cliente não consegue emitir a nota fiscal eletrônica",
      paginas: [
        paginas["Emissão de nota fiscal eletrônica"],
        paginas.outroEspaco,
        paginas["Rascunho sobre nota fiscal"],
      ],
    });

    it("openai: devolve a sugestão, montada com o problema e os trechos das páginas visíveis", async () => {
      const res = await naApi("openai").post(resolver(), pedido());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ sugestao: SUGESTAO_DA_IA });

      expect(ia.chamadas).toHaveLength(1);
      const enviado = JSON.stringify(ia.chamadas[0].corpo);
      expect(enviado).toContain("não consegue emitir a nota fiscal");
      expect(enviado).toContain("Emissão de nota fiscal eletrônica");
      expect(enviado).toContain("abra Tributos");
      expect(enviado).not.toContain("outro espaço");
      expect(enviado).not.toContain("Anotações pessoais");
    });

    it("aviao: fala o formato nativo, com o problema e as páginas", async () => {
      const res = await naApi("aviao").post(resolver(), pedido());
      expect(await res.json()).toEqual({ sugestao: SUGESTAO_DA_IA });
      expect(ia.chamadas[0].caminho).toBe("/resolver");
      expect(ia.chamadas[0].corpo).toEqual({
        texto: "O cliente não consegue emitir a nota fiscal eletrônica",
        paginas: [
          {
            nome: "Emissão de nota fiscal eletrônica",
            trecho: "Para emitir a nota fiscal eletrônica, abra Tributos e escolha Notas emitidas.",
          },
        ],
      });
    });

    it("sugestão longa chega cortada no tamanho do aviso", async () => {
      ia.setModo("longa");
      const corpo = (await (await naApi("openai").post(resolver(), pedido())).json()) as any;
      expect(corpo.sugestao.length).toBeLessThanOrEqual(600);
      expect(corpo.sugestao.endsWith("…")).toBe(true);
    });

    it("IA com erro: sugestão nula com o motivo, nunca 500", async () => {
      ia.setModo("erro");
      const res = await naApi("openai").post(resolver(), pedido());
      expect(res.status).toBe(200);
      const corpo = (await res.json()) as any;
      expect(corpo.sugestao).toBeNull();
      expect(corpo.motivo).toBeTruthy();
    });

    it("sem página visível não chama a IA", async () => {
      const res = await naApi("openai").post(resolver(), { texto: "nota fiscal", paginas: [paginas.outroEspaco] });
      expect(((await res.json()) as any).sugestao).toBeNull();
      expect(ia.chamadas).toHaveLength(0);
    });

    it("sem texto não chama a IA", async () => {
      const res = await naApi("openai").post(resolver(), {
        texto: "   ",
        paginas: [paginas["Emissão de nota fiscal eletrônica"]],
      });
      expect(((await res.json()) as any).sugestao).toBeNull();
      expect(ia.chamadas).toHaveLength(0);
    });

    it("a saída do texto para a IA fica na trilha de auditoria", async () => {
      await naApi("openai").post(resolver(), pedido());
      const registro = await prisma.auditLog.findFirst({
        where: { action: "export", metadata: { path: ["servico"], equals: "wiki-sugestoes" } },
        orderBy: { createdAt: "desc" },
      });
      expect(registro).not.toBeNull();
    });
  });
});
