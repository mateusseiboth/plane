/**
 * Sugestões da wiki da Quality ao abrir solicitação pelo atendimento.
 *
 * `GET  /workspaces/:slug/wiki/sugestoes/?q=&project_id=`  páginas da wiki da Quality parecidas com o problema
 * `POST /workspaces/:slug/wiki/sugestoes/resolver/`        o que fazer, respondido pela IA da Quality
 *
 * A fonte é o serviço "IA da Quality" (`IA_DA_QUALITY_URL`), não as páginas do
 * Plane. Aqui ele é um servidor FALSO (`Bun.serve` em porta livre) que imita
 * `/api/wiki/search`, `/api/wiki/document/:id`, `/api/ai/query` e
 * `/api/health`, e cada configuração sobe a sua instância da API.
 *
 * O que este arquivo fixa:
 *  - a busca sai com os termos ligados por OU e volta mapeada (endereço na
 *    wiki da Quality, sistema, trecho), no máximo 5, as do sistema escolhido primeiro;
 *  - serviço fora do ar, com erro ou lento devolve `[]` e `sugestao: null`, nunca 500;
 *  - a pergunta à IA leva o relato e os títulos das páginas;
 *  - quem não abre solicitação (`intake.create`) recebe 403;
 *  - a saída do texto para o serviço fica na trilha LGPD.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import prisma from "@db";
import { seedWorkflowRoles } from "@utils/permissions";
import { cleanDb } from "@tests/helpers/setup";
import { findPortaLivre, startApiDeTeste, type ApiDeTeste } from "@tests/helpers/api-de-teste";
import { apiClient, createMemberWithToken, createProject, createUser, createWorkspace } from "@tests/helpers/factory";

type Sugestao = { id: string; name: string; trecho: string; url: string; sistema: string };

const WIKI = "http://wiki.quality.teste";
const RESPOSTA_DA_IA = "Reemita a nota pelo menu Tributos, opção Notas emitidas, e confira o certificado digital.";

// ── IA da Quality falsa ───────────────────────────────────────────────────────

const RESULTADOS = [
  { id: 101, title: "Informativo NFS-e", path: "web/Nota_Fiscal/informativo", tags: ["nota", "fiscal"], summary: "" },
  {
    id: 102,
    title: "Número da nota fiscal",
    path: "web/Nota_Fiscal/numero",
    tags: ["nfse"],
    summary: "Resumo pronto.",
  },
  { id: 103, title: "Nota no Planejar", path: "Planejar/Nota", tags: [], summary: "" },
  { id: 104, title: "Parâmetros do Simples", path: "siart/ConfigParametros", tags: ["siart"], summary: "" },
  { id: 105, title: "Remessa BB", path: "contabilidade/Remessa_BB", tags: ["remessa", "banco"], summary: "" },
  { id: 106, title: "Guia no SIART", path: "web/Guia", tags: ["Siart"], summary: "" },
  { id: 107, title: "Outro assunto", path: "web/outro", tags: [], summary: "" },
];

const CONTEUDO: Record<string, string> = {
  "101":
    "<h1>Informativo NFS-e</h1><p>Para emitir a nota, abra <strong>Tributos</strong> e escolha Notas emitidas.</p>",
  "104": "<h1>Parâmetros</h1><p>Configure o arquivo de parâmetros do Simples.</p>",
};

type ModoIa = "ok" | "erro" | "lenta" | "erro-com-200";

function startIaDaQualityFalsa() {
  const buscas: string[] = [];
  const perguntas: string[] = [];
  let modo: ModoIa = "ok";

  const findDocumento = (id: string) =>
    RESULTADOS.find((r) => String(r.id) === id)
      ? Response.json({
          success: true,
          document: {
            id: Number(id),
            title: RESULTADOS.find((r) => String(r.id) === id)!.title,
            content: CONTEUDO[id] ?? "",
            description: "",
          },
        })
      : Response.json({ success: false, error: "Documento não encontrado" }, { status: 404 });

  const answer = (question: string) =>
    modo === "erro-com-200"
      ? Response.json({ query: question, response: "Desculpe, ocorreu um erro", source_info: { source: "Error" } })
      : Response.json({
          query: question,
          response: RESPOSTA_DA_IA,
          source_info: {
            source: "Knowledge Base",
            decision_reason: "Conteúdo relevante encontrado (2 trechos da wiki)",
            keywords_searched: ["nota fiscal"],
            pages_consulted: [
              { id: "web/Nota_Fiscal/informativo", title: "Informativo NFS-e", path: "web/Nota_Fiscal/informativo" },
              { id: "web/Nota_Fiscal/informativo", title: "Informativo NFS-e", path: "web/Nota_Fiscal/informativo" },
            ],
          },
        });

  const servidor = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/api/health") return Response.json({ status: "healthy" });
      if (modo === "erro") return Response.json({ error: "caiu" }, { status: 500 });
      if (modo === "lenta") await Bun.sleep(1500);
      if (url.pathname === "/api/wiki/search") {
        buscas.push(url.searchParams.get("q") ?? "");
        return Response.json({ success: true, results: RESULTADOS, total: RESULTADOS.length, query: "" });
      }
      const documento = url.pathname.match(/^\/api\/wiki\/document\/([^/]+)$/);
      if (documento) return findDocumento(documento[1]);
      if (url.pathname === "/api/ai/query" && req.method === "POST") {
        const { question } = (await req.json()) as { question: string };
        perguntas.push(question);
        return answer(question);
      }
      return new Response("caminho desconhecido", { status: 404 });
    },
  });

  return {
    base: `http://localhost:${servidor.port}`,
    buscas,
    perguntas,
    setModo: (novo: ModoIa) => {
      modo = novo;
    },
    clear: () => {
      buscas.length = 0;
      perguntas.length = 0;
      modo = "ok";
    },
    stop: () => servidor.stop(true),
  };
}

const pedido = () => ({ texto: "O cliente não consegue emitir a nota fiscal eletrônica", paginas: ["101", "104"] });

// ── Cenário ───────────────────────────────────────────────────────────────────

describe("sugestões da wiki da Quality ao abrir solicitação", () => {
  const ia = startIaDaQualityFalsa();
  const apis: Record<"ok" | "foraDoAr", ApiDeTeste | undefined> = { ok: undefined, foraDoAr: undefined };
  let slug: string;
  let siartId: string;
  let outroSistemaId: string;
  let atendimentoToken: string;
  let visualizadorToken: string;

  const naApi = (nome: keyof typeof apis, token = atendimentoToken) => apiClient(token, apis[nome]!.base);
  const sugestoes = (q: string, projectId?: string) =>
    `/workspaces/${slug}/wiki/sugestoes/?q=${encodeURIComponent(q)}${projectId ? `&project_id=${projectId}` : ""}`;
  const resolver = () => `/workspaces/${slug}/wiki/sugestoes/resolver/`;

  async function readSugestoes(nome: keyof typeof apis, q: string, projectId?: string): Promise<Sugestao[]> {
    const res = await naApi(nome).get(sugestoes(q, projectId));
    expect(res.status).toBe(200);
    return (await res.json()) as Sugestao[];
  }

  beforeAll(async () => {
    await cleanDb();
    const dono = await createUser({ email: "wiki-sugestoes@plane.test" });
    const ws = await createWorkspace(dono.id);
    slug = ws.slug;
    siartId = (await createProject(ws.id, dono.id, { identifier: "SIART", name: "Arrecadação" })).id;
    outroSistemaId = (await createProject(ws.id, dono.id, { identifier: "PLAN", name: "Planejar" })).id;
    await seedWorkflowRoles(prisma, ws.id);
    // Como a maioria do Atendimento: função no espaço, nenhum sistema.
    atendimentoToken = (await createMemberWithToken(ws.id, 6)).token;
    visualizadorToken = (await createMemberWithToken(ws.id, 5, siartId, 5)).token;

    const portaFechada = await findPortaLivre();
    const tempos = { IA_DA_QUALITY_TIMEOUT_MS: "800", IA_DA_QUALITY_RESPOSTA_TIMEOUT_MS: "800" };
    const [ok, foraDoAr] = await Promise.all([
      startApiDeTeste("wiki-quality-ok", { ...tempos, IA_DA_QUALITY_URL: ia.base, WIKI_DA_QUALITY_URL: `${WIKI}/` }),
      startApiDeTeste("wiki-quality-fora", { ...tempos, IA_DA_QUALITY_URL: `http://localhost:${portaFechada}` }),
    ]);
    apis.ok = ok;
    apis.foraDoAr = foraDoAr;
  });

  beforeEach(() => ia.clear());

  afterAll(async () => {
    Object.values(apis).forEach((api) => api?.parar());
    ia.stop();
    await cleanDb();
  });

  // ── busca ─────────────────────────────────────────────────────────────────

  it("busca na wiki da Quality com os termos do relato ligados por OU", async () => {
    await readSugestoes("ok", "O cliente não consegue emitir a nota fiscal eletrônica");
    expect(ia.buscas).toEqual(["emitir or nota or fiscal or eletrônica"]);
  });

  it("devolve até 5 páginas com id, título, trecho, endereço na wiki da Quality e sistema", async () => {
    const lista = await readSugestoes("ok", "emitir nota fiscal eletrônica");
    expect(lista).toHaveLength(5);
    expect(lista[0]).toEqual({
      id: "101",
      name: "Informativo NFS-e",
      trecho: "Para emitir a nota, abra Tributos e escolha Notas emitidas.",
      url: `${WIKI}/web/Nota_Fiscal/informativo`,
      sistema: "web",
    });
  });

  it("o trecho é o resumo quando há, e as tags quando a página não tem texto", async () => {
    const lista = await readSugestoes("ok", "emitir nota fiscal eletrônica");
    expect(lista.find((p) => p.id === "102")?.trecho).toBe("Resumo pronto.");
    expect(lista.find((p) => p.id === "105")?.trecho).toBe("remessa, banco");
  });

  it("com o sistema escolhido, as páginas dele vêm primeiro, pelo caminho ou pela tag", async () => {
    const lista = await readSugestoes("ok", "emitir nota fiscal eletrônica", siartId);
    expect(lista.slice(0, 2).map((p) => p.id)).toEqual(["104", "106"]);
    expect(lista.slice(2).map((p) => p.id)).toEqual(["101", "102", "103"]);
  });

  it("o sistema casa também pelo nome", async () => {
    const lista = await readSugestoes("ok", "emitir nota fiscal eletrônica", outroSistemaId);
    expect(lista[0].id).toBe("103");
  });

  it("project_id que não é de sistema do espaço não muda a ordem nem dá erro", async () => {
    const lista = await readSugestoes("ok", "emitir nota fiscal eletrônica", "nao-e-um-id");
    expect(lista.map((p) => p.id)).toEqual(["101", "102", "103", "104", "105"]);
  });

  it("q vazio, ausente ou só com palavras vazias devolve lista vazia, sem consultar o serviço", async () => {
    expect(await readSugestoes("ok", "")).toEqual([]);
    expect(await readSugestoes("ok", "o de a que para")).toEqual([]);
    const semQ = await naApi("ok").get(`/workspaces/${slug}/wiki/sugestoes/`);
    expect(semQ.status).toBe(200);
    expect(await semQ.json()).toEqual([]);
    expect(ia.buscas).toEqual([]);
  });

  it("serviço com erro devolve lista vazia, nunca 500", async () => {
    ia.setModo("erro");
    expect(await readSugestoes("ok", "emitir nota fiscal eletrônica")).toEqual([]);
  });

  it("serviço lento devolve lista vazia no tempo limite", async () => {
    ia.setModo("lenta");
    expect(await readSugestoes("ok", "emitir nota fiscal eletrônica")).toEqual([]);
  });

  it("serviço fora do ar devolve lista vazia", async () => {
    expect(await readSugestoes("foraDoAr", "emitir nota fiscal eletrônica")).toEqual([]);
  });

  it("quem não abre solicitação não consulta", async () => {
    const res = await naApi("ok", visualizadorToken).get(sugestoes("nota fiscal eletrônica"));
    expect(res.status).toBe(403);
    expect(ia.buscas).toEqual([]);
  });

  // ── sugestão de solução ───────────────────────────────────────────────────

  it("pergunta à IA da Quality com o relato e os títulos das páginas e devolve a resposta", async () => {
    const res = await naApi("ok").post(resolver(), pedido());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      sugestao: RESPOSTA_DA_IA,
      paginas_consultadas: [{ name: "Informativo NFS-e", url: `${WIKI}/web/Nota_Fiscal/informativo` }],
    });
    expect(ia.perguntas).toHaveLength(1);
    expect(ia.perguntas[0]).toContain("não consegue emitir a nota fiscal eletrônica");
    expect(ia.perguntas[0]).toContain("Informativo NFS-e; Parâmetros do Simples");
  });

  it("sem páginas, pergunta só com o relato", async () => {
    const res = await naApi("ok").post(resolver(), { texto: "A guia não emite", paginas: [] });
    expect(((await res.json()) as any).sugestao).toBe(RESPOSTA_DA_IA);
    expect(ia.perguntas[0]).toContain("A guia não emite");
  });

  it("sem texto não pergunta", async () => {
    const res = await naApi("ok").post(resolver(), { texto: "   ", paginas: ["101"] });
    const corpo = (await res.json()) as any;
    expect(corpo.sugestao).toBeNull();
    expect(corpo.motivo).toBeTruthy();
    expect(ia.perguntas).toEqual([]);
  });

  it.each(["erro", "erro-com-200", "lenta"] as const)(
    "IA no modo %s: sugestão nula com o motivo, nunca 500",
    async (modo) => {
      ia.setModo(modo);
      const res = await naApi("ok").post(resolver(), pedido());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ sugestao: null, motivo: "A IA da Quality não respondeu agora." });
    }
  );

  it("IA fora do ar: sugestão nula com o motivo", async () => {
    const res = await naApi("foraDoAr").post(resolver(), pedido());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sugestao: null, motivo: "A IA da Quality não respondeu agora." });
  });

  it("quem não abre solicitação não pede sugestão", async () => {
    const res = await naApi("ok", visualizadorToken).post(resolver(), pedido());
    expect(res.status).toBe(403);
    expect(ia.perguntas).toEqual([]);
  });

  it("a saída do texto para a IA da Quality fica na trilha de auditoria, sem o conteúdo", async () => {
    await naApi("ok").post(resolver(), pedido());
    const registro = await prisma.auditLog.findFirst({
      where: {
        entity: "page",
        action: "export",
        AND: [
          { metadata: { path: ["servico"], equals: "wiki-sugestoes" } },
          { metadata: { path: ["operacao"], equals: "resolucao" } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
    expect(registro).not.toBeNull();
    expect(JSON.stringify(registro!.metadata)).not.toContain("emitir");
    expect(registro!.metadata).toMatchObject({
      caracteres_enviados: pedido().texto.length,
      paginas_enviadas: ["101", "104"],
    });
  });

  it("a busca também fica na trilha, com a quantidade de termos enviados", async () => {
    await readSugestoes("ok", "emitir nota fiscal eletrônica");
    const registro = await prisma.auditLog.findFirst({
      where: {
        action: "export",
        AND: [
          { metadata: { path: ["servico"], equals: "wiki-sugestoes" } },
          { metadata: { path: ["operacao"], equals: "busca" } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
    expect(registro?.metadata).toMatchObject({ termos_enviados: 4 });
  });
});
