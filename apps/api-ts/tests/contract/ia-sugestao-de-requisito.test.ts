/**
 * IA de levantamento de requisitos — o "texto fantasma" do editor de chamados.
 *
 * Duas coisas mandam nestes testes:
 *
 *  - **Nada aqui toca o serviço de IA de verdade.** Um servidor falso local
 *    (`Bun.serve`, porta 0) faz o papel do worker — mesmo recurso que os testes
 *    do chat usam para a Z-API (`apps/chat-backend/tests/helpers/harness.ts`).
 *    Ele responde nos quatro formatos de provedor e sabe falhar, demorar e
 *    devolver prosa em vez de JSON.
 *  - **A configuração vive no processo do servidor**, então cada cenário sobe
 *    uma instância própria da API (leva ~0,4 s) apontando para o falso, com o
 *    formato e o tempo limite daquele cenário. É o que permite testar "IA
 *    desligada" e "IA ligada" no mesmo arquivo.
 *
 * O que está coberto: recurso desligado, formato inexistente, IA com erro, IA
 * lenta, os quatro provedores, modelo que não devolve JSON, montagem do
 * contexto (inclusive anexo com texto extraído), permissão e trilha LGPD.
 */

import {afterAll, beforeAll, describe, expect, it} from "bun:test";
import prisma from "@db";
import {
  addMember,
  apiClient,
  createApiToken,
  createEntity,
  createIssue,
  createLabel,
  createProject,
  createUser,
  createWorkspace,
  addLabelToIssue,
  createMemberWithToken,
} from "@tests/helpers/factory";
import {cleanDb} from "@tests/helpers/setup";
import {seedWorkflowRoles} from "@utils/permissions";
import {saveAsset} from "@utils/storage";
import path from "path";

// ── Servidor de IA falso ──────────────────────────────────────────────────────

type ChamadaIa = {
  caminho: string;
  corpo: any;
  chave: string | null;
  autorizacao: string | null;
  nomeArquivo?: string;
};

type ModoIa = "ok" | "erro" | "lento" | "prosa";

const SUGESTAO = "O sistema deve recalcular o total do rodapé somando apenas as linhas visíveis.";
const FALTANDO = [{bloco: "Números", item: "Falta um exemplo numérico com a conta."}];
const TEXTO_DO_PRINT = "Erro 500 ao salvar o lançamento";
/** Quanto o modo "lento" demora — bem acima de qualquer tempo limite de teste. */
const DEMORA_MS = 2500;

function iniciarIaFalsa() {
  const chamadas: ChamadaIa[] = [];
  let modo: ModoIa = "ok";

  /** O mesmo conteúdo, embrulhado do jeito de cada formato de provedor. */
  const RESPOSTA_POR_CAMINHO: Record<string, () => unknown> = {
    // Formato nativo do contrato: já vem com `faltando` e `confianca`.
    "/sugerir": () => ({sugestao: SUGESTAO, faltando: FALTANDO, confianca: 0.82}),
    // OpenAI: JSON dentro de choices[0].message.content.
    "/v1/chat/completions": () => ({
      choices: [{message: {role: "assistant", content: JSON.stringify({sugestao: SUGESTAO, faltando: FALTANDO})}}],
    }),
    // llama.cpp: JSON dentro de .content — e embrulhado em cerca de código,
    // que é como o modelo costuma responder de verdade.
    "/completion": () => ({
      content: "```json\n" + JSON.stringify({sugestao: SUGESTAO, faltando: FALTANDO}) + "\n```",
    }),
    // Ollama: JSON dentro de .message.content.
    "/api/chat": () => ({message: {role: "assistant", content: JSON.stringify({sugestao: SUGESTAO, faltando: FALTANDO})}}),
  };

  const servidor = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const chave = req.headers.get("x-api-key");
      const autorizacao = req.headers.get("authorization");

      if (url.pathname === "/ocr") {
        const form = await req.formData().catch(() => null);
        const arquivo = form?.get("arquivo");
        chamadas.push({
          caminho: "/ocr",
          corpo: null,
          chave,
          autorizacao,
          nomeArquivo: arquivo instanceof File ? arquivo.name : undefined,
        });
        return Response.json({texto_extraido: TEXTO_DO_PRINT});
      }

      const corpo = await req.json().catch(() => ({}));
      chamadas.push({caminho: url.pathname, corpo, chave, autorizacao});

      if (modo === "erro") return new Response("modelo caiu", {status: 500});
      if (modo === "lento") await Bun.sleep(DEMORA_MS);
      if (modo === "prosa") {
        // Modelo que ignorou o pedido de JSON. Sugestão em branco vale mais que
        // sugestão errada, então a rota tem de descartar isto.
        return Response.json({choices: [{message: {content: "Claro! Posso ajudar com esse chamado."}}]});
      }

      const monta = RESPOSTA_POR_CAMINHO[url.pathname];
      if (!monta) return new Response("caminho desconhecido", {status: 404});
      return Response.json(monta());
    },
  });

  return {
    base: `http://localhost:${servidor.port}`,
    chamadas,
    definirModo: (novo: ModoIa) => {
      modo = novo;
    },
    limpar: () => {
      chamadas.length = 0;
      modo = "ok" as ModoIa;
    },
    parar: () => servidor.stop(true),
  };
}

// ── Instâncias da API, uma por configuração ───────────────────────────────────

const RAIZ_API = path.resolve(import.meta.dir, "../..");

type ApiDeTeste = {base: string; parar: () => void};

async function portaLivre(): Promise<number> {
  const tampao = Bun.serve({port: 0, fetch: () => new Response("")});
  const porta = tampao.port;
  tampao.stop(true);
  return porta;
}

async function esperarSaude(porta: number, nome: string) {
  for (let tentativa = 0; tentativa < 100; tentativa++) {
    const ok = await fetch(`http://localhost:${porta}/api/v1/health/`)
      .then((r) => r.ok)
      .catch(() => false);
    if (ok) return;
    await Bun.sleep(100);
  }
  throw new Error(`A API de teste "${nome}" não subiu na porta ${porta}.`);
}

/** Sobe uma API com a configuração de IA do cenário e espera ela responder. */
async function subirApi(nome: string, configuracao: Record<string, string>): Promise<ApiDeTeste> {
  const porta = await portaLivre();
  const processo = Bun.spawn(["bun", "run", "src/index.ts"], {
    cwd: RAIZ_API,
    env: {...process.env, PORT: String(porta), ...configuracao},
    stdout: "pipe",
    stderr: "pipe",
  });
  await esperarSaude(porta, nome);
  return {base: `http://localhost:${porta}/api/v1`, parar: () => processo.kill()};
}

async function esperarAte<T>(fn: () => Promise<T | null>, tempoMs = 5000): Promise<T | null> {
  const limite = Date.now() + tempoMs;
  while (Date.now() < limite) {
    const valor = await fn();
    if (valor) return valor;
    await Bun.sleep(100);
  }
  return null;
}

// ── Cenário ───────────────────────────────────────────────────────────────────

describe("IA de sugestão de requisito", () => {
  const ia = iniciarIaFalsa();
  const apis: Record<string, ApiDeTeste> = {};

  let slug: string;
  let projetoId: string;
  let chamadoId: string;
  let token: string;
  let tokenAtendimento: string;
  let tokenVisualizador: string;
  let usuarioId: string;

  const caminho = () => `/workspaces/${slug}/ia/sugestao-de-requisito/`;

  /** Pedido completo, do jeito que a caixa de comentário manda. */
  const pedido = (extra: Record<string, unknown> = {}) => ({
    campo: "comentario",
    texto_atual: "O total do rodapé está errado quando ",
    cursor: 35,
    project_id: projetoId,
    issue_id: chamadoId,
    ...extra,
  });

  beforeAll(async () => {
    await cleanDb();

    const dono = await createUser();
    usuarioId = dono.id;
    token = (await createApiToken(dono.id)).token;
    const ws = await createWorkspace(dono.id);
    slug = ws.slug;

    const projeto = await createProject(ws.id, dono.id, {name: "Recursos Humanos"});
    projetoId = projeto.id;

    const entidade = await createEntity(ws.id, {name: "Prefeitura de Içara"});
    const chamado = await createIssue(projeto.id, ws.id, {
      name: "[Folha] Total do rodapé diverge do somatório das linhas",
      entityId: entidade.id,
      descriptionStripped: "Ao filtrar por secretaria, o rodapé continua somando as linhas escondidas.",
      createdById: dono.id,
    });
    chamadoId = chamado.id;

    // O tipo do chamado sai do rótulo, como no resto do fork.
    const rotulo = await createLabel(projeto.id, ws.id, {name: "Correção"});
    await addLabelToIssue(chamado.id, rotulo.id, projeto.id, ws.id);

    await prisma.issueComment.create({
      data: {
        issueId: chamado.id,
        projectId: projeto.id,
        workspaceId: ws.id,
        actorId: dono.id,
        commentHtml: "<p>Acontece desde a atualização de terça.</p>",
        commentStripped: "Acontece desde a atualização de terça.",
      },
    });

    // Anexo com imagem de verdade no storage, para o caminho do OCR rodar
    // inteiro (banco → storage → /ocr → contexto).
    const arquivo = await prisma.fileAsset.create({
      data: {
        workspaceId: ws.id,
        projectId: projeto.id,
        entityType: 2,
        entityId: chamado.id,
        asset: "erro.png",
        size: 68,
        mimeType: "image/png",
        isUploaded: true,
        attributes: {name: "erro.png", type: "image/png"},
      },
    });
    await saveAsset(arquivo.id, new Blob([new Uint8Array(68)], {type: "image/png"}));
    await prisma.issueAttachment.create({
      data: {
        issueId: chamado.id,
        workspaceId: ws.id,
        projectId: projeto.id,
        asset: arquivo.id,
        attributes: {name: "erro.png", type: "image/png", size: 68},
      },
    });

    // Atendimento (6) abre chamado pela triagem; Visualizador (5) não abre nada.
    tokenAtendimento = (await createMemberWithToken(ws.id, 6, projeto.id, 6)).token;
    const visualizador = await createUser();
    tokenVisualizador = (await createApiToken(visualizador.id)).token;
    await addMember(ws.id, visualizador.id, 5, projeto.id, 5);

    await seedWorkflowRoles(prisma, ws.id);

    const comum = {IA_REQUISITOS_CHAVE: "chave-secreta-do-servidor", IA_REQUISITOS_MODELO: "qwen3.5-4b"};
    const [desligada, aviao, openai, llamacpp, ollama, invalida] = await Promise.all([
      subirApi("desligada", {IA_REQUISITOS_URL: ""}),
      subirApi("aviao", {...comum, IA_REQUISITOS_URL: ia.base, IA_REQUISITOS_FORMATO: "aviao", IA_REQUISITOS_TIMEOUT_MS: "800"}),
      subirApi("openai", {...comum, IA_REQUISITOS_URL: ia.base, IA_REQUISITOS_FORMATO: "openai"}),
      subirApi("llamacpp", {...comum, IA_REQUISITOS_URL: ia.base, IA_REQUISITOS_FORMATO: "llamacpp"}),
      subirApi("ollama", {...comum, IA_REQUISITOS_URL: ia.base, IA_REQUISITOS_FORMATO: "ollama"}),
      subirApi("invalida", {...comum, IA_REQUISITOS_URL: ia.base, IA_REQUISITOS_FORMATO: "disquete"}),
    ]);
    Object.assign(apis, {desligada, aviao, openai, llamacpp, ollama, invalida});
  });

  afterAll(() => {
    for (const api of Object.values(apis)) api.parar();
    ia.parar();
  });

  const cliente = (nome: string, chaveDeAcesso = token) => apiClient(chaveDeAcesso, apis[nome]!.base);

  // ── A IA pode não estar lá ──────────────────────────────────────────────────

  it("sem IA configurada responde 200 com sugestão vazia e não chama ninguém", async () => {
    ia.limpar();
    const res = await cliente("desligada").post(caminho(), pedido());
    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.sugestao).toBe("");
    expect(corpo.faltando).toEqual([]);
    expect(ia.chamadas).toHaveLength(0);
  });

  it("formato de provedor inexistente não derruba o servidor: 200 vazio e nenhuma chamada", async () => {
    ia.limpar();
    const res = await cliente("invalida").post(caminho(), pedido());
    expect(res.status).toBe(200);
    expect((await res.json()).sugestao).toBe("");
    expect(ia.chamadas).toHaveLength(0);
  });

  it("IA com erro devolve 200 com sugestão vazia", async () => {
    ia.limpar();
    ia.definirModo("erro");
    const res = await cliente("aviao").post(caminho(), pedido());
    ia.definirModo("ok");

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({sugestao: "", faltando: []});
    expect(ia.chamadas.some((c) => c.caminho === "/sugerir")).toBe(true);
  });

  it("IA lenta estoura o tempo limite e devolve 200 com sugestão vazia", async () => {
    ia.limpar();
    ia.definirModo("lento");
    const inicio = Date.now();
    const res = await cliente("aviao").post(caminho(), pedido());
    const decorrido = Date.now() - inicio;
    ia.definirModo("ok");

    expect(res.status).toBe(200);
    expect((await res.json()).sugestao).toBe("");
    // Cortou pelo tempo limite (800 ms) e não esperou o modelo (2,5 s).
    expect(decorrido).toBeLessThan(DEMORA_MS);
  });

  // ── Um provedor por formato ─────────────────────────────────────────────────

  it("provedor aviao usa o /sugerir do contrato e autentica com X-API-Key", async () => {
    ia.limpar();
    const res = await cliente("aviao").post(caminho(), pedido());
    expect(res.status).toBe(200);

    const corpo = await res.json();
    expect(corpo.sugestao).toBe(SUGESTAO);
    expect(corpo.faltando).toEqual(FALTANDO);
    expect(corpo.confianca).toBe(0.82);

    const chamada = ia.chamadas.find((c) => c.caminho === "/sugerir")!;
    expect(chamada).toBeDefined();
    // A credencial sai do servidor, nunca do navegador.
    expect(chamada.chave).toBe("chave-secreta-do-servidor");
  });

  it("provedor openai lê a sugestão de choices[0].message.content", async () => {
    ia.limpar();
    const res = await cliente("openai").post(caminho(), pedido());
    expect(res.status).toBe(200);
    expect((await res.json()).sugestao).toBe(SUGESTAO);

    const chamada = ia.chamadas.find((c) => c.caminho === "/v1/chat/completions")!;
    expect(chamada).toBeDefined();
    expect(chamada.autorizacao).toBe("Bearer chave-secreta-do-servidor");
    expect(chamada.corpo.model).toBe("qwen3.5-4b");
    // A metodologia da Aula 18-3 viaja no prompt para quem não é o modelo nativo.
    expect(chamada.corpo.messages[0].content).toContain("DADO / QUANDO / ENTÃO");
  });

  it("provedor llamacpp lê a sugestão de .content, mesmo em cerca de código", async () => {
    ia.limpar();
    const res = await cliente("llamacpp").post(caminho(), pedido());
    expect(res.status).toBe(200);
    expect((await res.json()).sugestao).toBe(SUGESTAO);
    expect(ia.chamadas.some((c) => c.caminho === "/completion")).toBe(true);
  });

  it("provedor ollama lê a sugestão de .message.content", async () => {
    ia.limpar();
    const res = await cliente("ollama").post(caminho(), pedido());
    expect(res.status).toBe(200);
    expect((await res.json()).sugestao).toBe(SUGESTAO);

    const chamada = ia.chamadas.find((c) => c.caminho === "/api/chat")!;
    expect(chamada).toBeDefined();
    expect(chamada.corpo.format).toBe("json");
  });

  it("modelo que responde prosa em vez de JSON não vira sugestão", async () => {
    ia.limpar();
    ia.definirModo("prosa");
    const res = await cliente("openai").post(caminho(), pedido());
    ia.definirModo("ok");

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({sugestao: "", faltando: []});
  });

  // ── Contexto ────────────────────────────────────────────────────────────────

  it("monta o contexto do chamado: tipo, projeto, entidade, título, descrição, comentários e anexos", async () => {
    ia.limpar();
    const res = await cliente("aviao").post(caminho(), pedido());
    expect(res.status).toBe(200);

    const enviado = ia.chamadas.find((c) => c.caminho === "/sugerir")!.corpo;
    expect(enviado.campo).toBe("comentario");
    expect(enviado.texto_atual).toBe("O total do rodapé está errado quando ");
    expect(enviado.cursor).toBe(35);

    const ctx = enviado.contexto;
    expect(ctx.tipo).toBe("correcao");
    expect(ctx.projeto).toBe("Recursos Humanos");
    expect(ctx.entidade).toBe("Prefeitura de Içara");
    expect(ctx.titulo).toBe("[Folha] Total do rodapé diverge do somatório das linhas");
    expect(ctx.descricao).toContain("rodapé continua somando as linhas escondidas");
    expect(ctx.comentarios).toEqual(["Acontece desde a atualização de terça."]);

    // O anexo chega com o texto extraído do print pelo /ocr do worker.
    expect(ctx.anexos).toEqual([{nome: "erro.png", texto_extraido: TEXTO_DO_PRINT}]);
    expect(ia.chamadas.find((c) => c.caminho === "/ocr")?.nomeArquivo).toBe("erro.png");
  });

  it("ao escrever o título, o contexto não devolve o próprio título de volta", async () => {
    ia.limpar();
    const res = await cliente("aviao").post(caminho(), pedido({campo: "titulo", texto_atual: "[Folha] ", cursor: 8}));
    expect(res.status).toBe(200);

    const ctx = ia.chamadas.find((c) => c.caminho === "/sugerir")!.corpo.contexto;
    expect(ctx.titulo).toBeUndefined();
    expect(ctx.descricao).toBeUndefined();
    expect(ctx.projeto).toBe("Recursos Humanos");
  });

  it("chamado ainda inexistente manda o tipo e a entidade informados pela tela", async () => {
    ia.limpar();
    const entidade = await prisma.entity.findFirstOrThrow({where: {name: "Prefeitura de Içara"}});
    const res = await cliente("aviao").post(
      caminho(),
      pedido({campo: "descricao", issue_id: null, tipo: "melhoria", entity_id: entidade.id}),
    );
    expect(res.status).toBe(200);

    const ctx = ia.chamadas.find((c) => c.caminho === "/sugerir")!.corpo.contexto;
    expect(ctx.tipo).toBe("melhoria");
    expect(ctx.entidade).toBe("Prefeitura de Içara");
    expect(ctx.comentarios).toEqual([]);
    expect(ctx.anexos).toEqual([]);
  });

  it("no modal de novo chamado, o que está na tela vira contexto", async () => {
    ia.limpar();
    // Ainda não há chamado salvo: título e descrição só existem no navegador.
    const res = await cliente("aviao").post(
      caminho(),
      pedido({
        campo: "comentario",
        issue_id: null,
        contexto: {
          projeto: "ignorado, o banco manda",
          entidade: "Prefeitura de Criciúma",
          titulo: "[Folha] Rodapé soma linha filtrada",
          descricao: "Some 3 linhas visíveis mas o rodapé traz 7.",
          comentarios: ["primeiro relato por telefone"],
          tipo: "correcao",
        },
      }),
    );
    expect(res.status).toBe(200);

    const ctx = ia.chamadas.find((c) => c.caminho === "/sugerir")!.corpo.contexto;
    expect(ctx.titulo).toBe("[Folha] Rodapé soma linha filtrada");
    expect(ctx.descricao).toBe("Some 3 linhas visíveis mas o rodapé traz 7.");
    expect(ctx.comentarios).toEqual(["primeiro relato por telefone"]);
    expect(ctx.entidade).toBe("Prefeitura de Criciúma");
    expect(ctx.tipo).toBe("correcao");
    // O registro salvo é a fonte da verdade: o nome do projeto vem do banco.
    expect(ctx.projeto).toBe("Recursos Humanos");
  });

  it("o chamado salvo vence o que a tela mandou", async () => {
    ia.limpar();
    const res = await cliente("aviao").post(caminho(), pedido({contexto: {titulo: "título inventado pela tela"}}));
    expect(res.status).toBe(200);

    const ctx = ia.chamadas.find((c) => c.caminho === "/sugerir")!.corpo.contexto;
    expect(ctx.titulo).toBe("[Folha] Total do rodapé diverge do somatório das linhas");
  });

  it("só com issue_id o projeto é descoberto e a permissão continua valendo", async () => {
    ia.limpar();
    const res = await cliente("aviao").post(caminho(), pedido({project_id: undefined}));
    expect(res.status).toBe(200);
    expect((await res.json()).sugestao).toBe(SUGESTAO);
  });

  it("sem projeto e sem chamado é 400, porque não há permissão a conferir", async () => {
    ia.limpar();
    const res = await cliente("aviao").post(caminho(), pedido({project_id: undefined, issue_id: undefined}));
    expect(res.status).toBe(400);
    expect(ia.chamadas).toHaveLength(0);
  });

  // ── Permissão ───────────────────────────────────────────────────────────────

  it("quem não pode abrir chamado no projeto recebe 403", async () => {
    ia.limpar();
    const res = await cliente("aviao", tokenVisualizador).post(caminho(), pedido());
    expect(res.status).toBe(403);
    expect(ia.chamadas).toHaveLength(0);
  });

  it("Atendimento, que abre chamado pela triagem, recebe sugestão", async () => {
    ia.limpar();
    const res = await cliente("aviao", tokenAtendimento).post(caminho(), pedido());
    expect(res.status).toBe(200);
    expect((await res.json()).sugestao).toBe(SUGESTAO);
  });

  it("campo inválido é 400 e não chega à IA", async () => {
    ia.limpar();
    const res = await cliente("aviao").post(caminho(), pedido({campo: "assunto"}));
    expect(res.status).toBe(400);
    expect(ia.chamadas).toHaveLength(0);
  });

  // ── Trilha LGPD ─────────────────────────────────────────────────────────────

  it("registra na trilha que o conteúdo saiu, sem copiar o conteúdo para o log", async () => {
    ia.limpar();
    await prisma.auditLog.deleteMany({where: {entityId: chamadoId}});

    const res = await cliente("aviao").post(caminho(), pedido());
    expect(res.status).toBe(200);

    // recordAudit é assíncrono de propósito: a gravação não segura a resposta.
    const registro = await esperarAte(() =>
      prisma.auditLog.findFirst({where: {entityId: chamadoId, action: "export"}}),
    );
    expect(registro).not.toBeNull();
    expect(registro!.entity).toBe("issue");
    expect(registro!.actorId).toBe(usuarioId);

    const meta = registro!.metadata as Record<string, unknown>;
    expect(meta.servico).toBe("ia-requisitos");
    expect(meta.formato).toBe("aviao");
    expect(meta.destino).toBe(new URL(ia.base).host);
    expect(meta.campo).toBe("comentario");
    expect(meta.projeto_id).toBe(projetoId);
    expect(meta.chamado_id).toBe(chamadoId);
    expect(meta.caracteres_enviados).toBe(37);
    expect(meta.comentarios_enviados).toBe(1);
    expect(meta.anexos_enviados).toBe(1);
    expect(meta.anexos_com_texto).toBe(1);

    // A trilha diz que saiu; ela não é uma segunda cópia do que saiu.
    const gravado = JSON.stringify({changes: registro!.changes, metadata: registro!.metadata});
    expect(gravado).not.toContain("O total do rodapé está errado");
    expect(gravado).not.toContain(TEXTO_DO_PRINT);
    expect(gravado).not.toContain("Acontece desde a atualização");
    // Nem a credencial da IA, que nunca sai do servidor.
    expect(gravado).not.toContain("chave-secreta-do-servidor");
  });

  it("com a IA desligada não há o que registrar: nada saiu da aplicação", async () => {
    await prisma.auditLog.deleteMany({where: {entityId: chamadoId}});
    const res = await cliente("desligada").post(caminho(), pedido());
    expect(res.status).toBe(200);

    await Bun.sleep(300);
    expect(await prisma.auditLog.count({where: {entityId: chamadoId, action: "export"}})).toBe(0);
  });
});
