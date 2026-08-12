/**
 * "Melhorar com IA" — o botão da caixa de comentário e da descrição do chamado.
 *
 * A rota é `POST /workspaces/:slug/ai-assistant/improve-text/` e ela agora tem
 * dois caminhos possíveis, nesta ordem: o `AiProvider` cadastrado pelo espaço de
 * trabalho e, na falta dele, a IA de levantamento de requisitos. Só quando não
 * há nenhum dos dois ela volta a dizer que não existe provedor configurado.
 *
 * Como nos testes irmãos de IA:
 *
 *  - **Nada aqui toca serviço de IA de verdade.** Dois servidores falsos locais
 *    (`Bun.serve`, porta 0) fazem os papéis: um é o serviço de requisitos (fala
 *    os quatro formatos, sabe falhar, demorar e responder fora do combinado) e o
 *    outro é o provedor cadastrado, no protocolo da OpenAI. São dois para que se
 *    possa afirmar QUAL deles foi chamado.
 *  - **A configuração do serviço vive no processo**, então cada formato sobe uma
 *    instância própria da API apontando para o falso. Já o `AiProvider` mora no
 *    banco e é criado e apagado por teste, sem reiniciar nada.
 */

import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it} from "bun:test";
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
import {CHAVE_CONFIG_IA, CONFIG_IA_PADRAO} from "@modules/ia-requisitos/configuracao";
import {seedWorkflowRoles} from "@utils/permissions";
import path from "path";

// ── Serviço de IA de requisitos, falso ────────────────────────────────────────

type ChamadaIa = {caminho: string; corpo: any; chave: string | null; autorizacao: string | null};

/** `ok` responde o combinado; os outros são as formas conhecidas de dar errado. */
type ModoIa = "ok" | "erro" | "lento" | "html-cru" | "vazio";

const MELHORADO = "<p>O sistema deve somar no rodapé apenas as linhas visíveis do filtro.</p>";
/** Quanto o modo "lento" demora — bem acima de qualquer tempo limite de teste. */
const DEMORA_MS = 2500;

function iniciarIaFalsa() {
  const chamadas: ChamadaIa[] = [];
  let modo: ModoIa = "ok";

  /** O mesmo texto melhorado, embrulhado do jeito de cada formato de provedor. */
  const RESPOSTA_POR_CAMINHO: Record<string, () => unknown> = {
    // Formato nativo do contrato: {"texto": "…", "mudou": true}.
    "/melhorar": () => ({texto: MELHORADO, mudou: true}),
    // OpenAI: o JSON pedido dentro de choices[0].message.content.
    "/v1/chat/completions": () => ({
      choices: [{message: {role: "assistant", content: JSON.stringify({texto: MELHORADO})}}],
    }),
    // llama.cpp: dentro de .content, e em cerca de código — como o modelo
    // costuma responder de verdade.
    "/completion": () => ({content: "```json\n" + JSON.stringify({texto: MELHORADO}) + "\n```"}),
    // Ollama: dentro de .message.content.
    "/api/chat": () => ({message: {role: "assistant", content: JSON.stringify({texto: MELHORADO})}}),
  };

  /** O que cada modo de falha responde, quando não é o caminho feliz. */
  const RESPOSTA_POR_MODO: Partial<Record<ModoIa, (caminho: string) => Response>> = {
    erro: () => new Response("modelo caiu", {status: 500}),
    // Modelo que ignorou o pedido de JSON e mandou o HTML direto: ainda é o que
    // se pediu, então tem de valer.
    "html-cru": (caminho) =>
      Response.json(
        caminho === "/melhorar" ? {texto: MELHORADO} : {choices: [{message: {content: MELHORADO}}]},
      ),
    // Resposta na forma certa e sem nada dentro.
    vazio: (caminho) =>
      Response.json(caminho === "/melhorar" ? {texto: "", mudou: false} : {choices: [{message: {content: ""}}]}),
  };

  const servidor = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const corpo = await req.json().catch(() => ({}));
      chamadas.push({
        caminho: url.pathname,
        corpo,
        chave: req.headers.get("x-api-key"),
        autorizacao: req.headers.get("authorization"),
      });

      if (modo === "lento") await Bun.sleep(DEMORA_MS);
      const doModo = RESPOSTA_POR_MODO[modo];
      if (doModo) return doModo(url.pathname);

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

// ── Provedor cadastrado pelo espaço (AiProvider), falso ───────────────────────

const MELHORADO_PELO_CADASTRADO = "<p>Texto melhorado pelo provedor cadastrado no espaço.</p>";

function iniciarProvedorCadastrado() {
  const chamadas: {corpo: any; autorizacao: string | null}[] = [];
  let responder: () => Response = () =>
    Response.json({choices: [{message: {role: "assistant", content: MELHORADO_PELO_CADASTRADO}}]});

  const servidor = Bun.serve({
    port: 0,
    async fetch(req) {
      chamadas.push({corpo: await req.json().catch(() => ({})), autorizacao: req.headers.get("authorization")});
      return responder();
    },
  });

  return {
    base: `http://localhost:${servidor.port}`,
    chamadas,
    derrubar: () => {
      responder = () => new Response("provedor fora do ar", {status: 500});
    },
    limpar: () => {
      chamadas.length = 0;
      responder = () => Response.json({choices: [{message: {content: MELHORADO_PELO_CADASTRADO}}]});
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

describe("Melhorar com IA", () => {
  const ia = iniciarIaFalsa();
  const cadastrado = iniciarProvedorCadastrado();
  const apis: Record<string, ApiDeTeste> = {};

  let workspaceId: string;
  let slug: string;
  let projetoId: string;
  let chamadoId: string;
  let token: string;
  let tokenVisualizador: string;
  let usuarioId: string;

  const caminho = () => `/workspaces/${slug}/ai-assistant/improve-text/`;

  const TEXTO = "<p>o total do rodape ta errado quando filtra por secretaria</p>";

  /** O pedido do jeito que o botão manda hoje: só o texto e o que a tela sabe. */
  const pedido = (extra: Record<string, unknown> = {}) => ({
    content: TEXTO,
    context: {
      issue_title: "[Folha] Total do rodapé diverge do somatório das linhas",
      project_name: "Recursos Humanos",
      previous_comments: ["Acontece desde a atualização de terça."],
    },
    ...extra,
  });

  /** O provedor cadastrado do espaço, no protocolo da OpenAI. */
  async function cadastrarProvedor(extra: Record<string, unknown> = {}) {
    return prisma.aiProvider.create({
      data: {
        workspaceId,
        name: "Provedor do espaço",
        providerType: "openai",
        baseUrl: cadastrado.base,
        apiKey: "chave-do-provedor-cadastrado",
        defaultModel: "gpt-4o-mini",
        timeoutSecs: 5,
        isActive: true,
        isDefault: true,
        createdById: usuarioId,
        ...extra,
      },
    });
  }

  async function gravarConfig(valor: unknown) {
    await prisma.workspaceSetting.upsert({
      where: {workspaceId_key: {workspaceId, key: CHAVE_CONFIG_IA}},
      create: {workspaceId, key: CHAVE_CONFIG_IA, value: valor as any},
      update: {value: valor as any},
    });
  }

  beforeAll(async () => {
    await cleanDb();

    const dono = await createUser();
    usuarioId = dono.id;
    token = (await createApiToken(dono.id)).token;
    const ws = await createWorkspace(dono.id);
    workspaceId = ws.id;
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

    await createMemberWithToken(ws.id, 6, projeto.id, 6);
    const visualizador = await createUser();
    tokenVisualizador = (await createApiToken(visualizador.id)).token;
    await addMember(ws.id, visualizador.id, 5, projeto.id, 5);

    await seedWorkflowRoles(prisma, ws.id);

    const comum = {IA_REQUISITOS_CHAVE: "chave-secreta-do-servidor", IA_REQUISITOS_MODELO: "qwen3.5-4b"};
    const [desligada, aviao, openai, llamacpp, ollama] = await Promise.all([
      subirApi("desligada", {IA_REQUISITOS_URL: ""}),
      subirApi("aviao", {
        ...comum,
        IA_REQUISITOS_URL: ia.base,
        IA_REQUISITOS_FORMATO: "aviao",
        IA_REQUISITOS_TIMEOUT_MS: "800",
        // A melhoria tem teto PRÓPRIO e bem maior: quem clicou está esperando,
        // e o modelo escreve o template inteiro. Sem fixá-lo aqui o cenário
        // "lento" não estoura tempo nenhum e o teste passa a provar nada.
        IA_REQUISITOS_MELHORIA_TIMEOUT_MS: "800",
      }),
      subirApi("openai", {...comum, IA_REQUISITOS_URL: ia.base, IA_REQUISITOS_FORMATO: "openai"}),
      subirApi("llamacpp", {...comum, IA_REQUISITOS_URL: ia.base, IA_REQUISITOS_FORMATO: "llamacpp"}),
      subirApi("ollama", {...comum, IA_REQUISITOS_URL: ia.base, IA_REQUISITOS_FORMATO: "ollama"}),
    ]);
    Object.assign(apis, {desligada, aviao, openai, llamacpp, ollama});
  });

  afterAll(() => {
    for (const api of Object.values(apis)) api.parar();
    ia.parar();
    cadastrado.parar();
  });

  // Cada teste começa do estado de fábrica: provedor cadastrado e configuração
  // do espaço vivem no banco e são lidos a cada chamada.
  beforeEach(async () => {
    ia.limpar();
    cadastrado.limpar();
    await prisma.aiProvider.deleteMany({where: {workspaceId}});
    await prisma.workspaceSetting.deleteMany({where: {workspaceId, key: CHAVE_CONFIG_IA}});
  });

  afterEach(() => {
    ia.definirModo("ok");
  });

  const cliente = (nome: string, chaveDeAcesso = token) => apiClient(chaveDeAcesso, apis[nome]!.base);

  // ── Quem já tem provedor cadastrado não sente diferença ─────────────────────

  it("com AiProvider configurado, é ele quem melhora — a IA de requisitos nem é consultada", async () => {
    await cadastrarProvedor();

    const res = await cliente("aviao").post(caminho(), pedido());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({response: MELHORADO_PELO_CADASTRADO, original: TEXTO});

    // O provedor do espaço vence mesmo com a IA de requisitos ligada e de pé.
    expect(ia.chamadas).toHaveLength(0);
    expect(cadastrado.chamadas).toHaveLength(1);
  });

  it("o prompt de sempre continua indo ao provedor cadastrado, com o contexto da tela", async () => {
    await cadastrarProvedor();
    const res = await cliente("aviao").post(caminho(), pedido());
    expect(res.status).toBe(200);

    const enviado = cadastrado.chamadas[0]!;
    expect(enviado.autorizacao).toBe("Bearer chave-do-provedor-cadastrado");
    expect(enviado.corpo.model).toBe("gpt-4o-mini");

    const sistema = enviado.corpo.messages[0].content;
    expect(sistema).toContain("REGRAS OBRIGATÓRIAS");
    expect(sistema).toContain("Sistema/Projeto: Recursos Humanos");
    expect(sistema).toContain("Título: [Folha] Total do rodapé diverge do somatório das linhas");
    expect(sistema).toContain("Acontece desde a atualização de terça.");
    // O texto a melhorar vai na mensagem do usuário, sem HTML.
    expect(enviado.corpo.messages[1].content).toContain("o total do rodape ta errado");
  });

  it("provedor cadastrado fora do ar continua devolvendo 502, como antes", async () => {
    await cadastrarProvedor();
    cadastrado.derrubar();

    const res = await cliente("aviao").post(caminho(), pedido());
    expect(res.status).toBe(502);
    expect((await res.json()).detail).toContain("Erro no provedor de IA");
    // Não há atalho: falhar no provedor do espaço não cai na IA de requisitos.
    expect(ia.chamadas).toHaveLength(0);
  });

  it("provedor cadastrado inativo ou não-padrão não conta: a vez é da IA de requisitos", async () => {
    await cadastrarProvedor({isActive: false});

    const res = await cliente("aviao").post(caminho(), pedido());
    expect(res.status).toBe(200);
    expect((await res.json()).response).toBe(MELHORADO);
    expect(cadastrado.chamadas).toHaveLength(0);
    expect(ia.chamadas.some((c) => c.caminho === "/melhorar")).toBe(true);
  });

  // ── Sem provedor cadastrado, quem melhora é a IA de requisitos ──────────────

  it("sem AiProvider, o botão passa a funcionar pela IA de requisitos", async () => {
    const res = await cliente("aviao").post(caminho(), pedido());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({response: MELHORADO, original: TEXTO});

    const chamada = ia.chamadas.find((c) => c.caminho === "/melhorar")!;
    expect(chamada).toBeDefined();
    // A credencial sai do servidor, nunca do navegador.
    expect(chamada.chave).toBe("chave-secreta-do-servidor");
    // Texto e contexto — a metodologia é assunto do serviço, não do prompt.
    expect(chamada.corpo.texto).toBe(TEXTO);
    expect(chamada.corpo.campo).toBe("comentario");
    expect(chamada.corpo.contexto.titulo).toBe("[Folha] Total do rodapé diverge do somatório das linhas");
    expect(chamada.corpo.contexto.projeto).toBe("Recursos Humanos");
    expect(chamada.corpo.contexto.comentarios).toEqual(["Acontece desde a atualização de terça."]);
  });

  it("com o chamado informado, o contexto vem do banco e não do que a tela disse", async () => {
    const res = await cliente("aviao").post(
      caminho(),
      pedido({
        project_id: projetoId,
        issue_id: chamadoId,
        context: {issue_title: "título inventado pela tela", project_name: "projeto inventado"},
      }),
    );
    expect(res.status).toBe(200);

    const ctx = ia.chamadas.find((c) => c.caminho === "/melhorar")!.corpo.contexto;
    expect(ctx.titulo).toBe("[Folha] Total do rodapé diverge do somatório das linhas");
    expect(ctx.projeto).toBe("Recursos Humanos");
    expect(ctx.entidade).toBe("Prefeitura de Içara");
    expect(ctx.tipo).toBe("correcao");
    expect(ctx.comentarios).toEqual(["Acontece desde a atualização de terça."]);
  });

  it("melhorando a descrição, o contexto não devolve a própria descrição de volta", async () => {
    const res = await cliente("aviao").post(
      caminho(),
      pedido({campo: "descricao", project_id: projetoId, issue_id: chamadoId}),
    );
    expect(res.status).toBe(200);

    const enviado = ia.chamadas.find((c) => c.caminho === "/melhorar")!.corpo;
    expect(enviado.campo).toBe("descricao");
    expect(enviado.contexto.titulo).toBe("[Folha] Total do rodapé diverge do somatório das linhas");
    expect(enviado.contexto.descricao).toBeUndefined();
  });

  it("quem não pode abrir chamado no projeto informado recebe 403", async () => {
    const res = await cliente("aviao", tokenVisualizador).post(
      caminho(),
      pedido({project_id: projetoId, issue_id: chamadoId}),
    );
    expect(res.status).toBe(403);
    expect(ia.chamadas).toHaveLength(0);
  });

  // ── Um provedor por formato ─────────────────────────────────────────────────

  it("provedor openai lê o texto de choices[0].message.content", async () => {
    const res = await cliente("openai").post(caminho(), pedido());
    expect(res.status).toBe(200);
    expect((await res.json()).response).toBe(MELHORADO);

    const chamada = ia.chamadas.find((c) => c.caminho === "/v1/chat/completions")!;
    expect(chamada).toBeDefined();
    expect(chamada.autorizacao).toBe("Bearer chave-secreta-do-servidor");
    expect(chamada.corpo.model).toBe("qwen3.5-4b");
    // Para quem não é o modelo nativo, a régua da Aula 18-3 viaja no prompt.
    expect(chamada.corpo.messages[0].content).toContain("DADO / QUANDO / ENTÃO");
    expect(chamada.corpo.messages[1].content).toContain("Texto a melhorar:");
  });

  it("provedor llamacpp lê o texto de .content, mesmo em cerca de código", async () => {
    const res = await cliente("llamacpp").post(caminho(), pedido());
    expect(res.status).toBe(200);
    expect((await res.json()).response).toBe(MELHORADO);
    expect(ia.chamadas.some((c) => c.caminho === "/completion")).toBe(true);
  });

  it("provedor ollama lê o texto de .message.content", async () => {
    const res = await cliente("ollama").post(caminho(), pedido());
    expect(res.status).toBe(200);
    expect((await res.json()).response).toBe(MELHORADO);

    const chamada = ia.chamadas.find((c) => c.caminho === "/api/chat")!;
    expect(chamada).toBeDefined();
    expect(chamada.corpo.format).toBe("json");
  });

  it("modelo que responde o HTML direto, sem o JSON pedido, ainda entrega o texto", async () => {
    ia.definirModo("html-cru");
    const res = await cliente("openai").post(caminho(), pedido());
    expect(res.status).toBe(200);
    expect((await res.json()).response).toBe(MELHORADO);
  });

  // ── Nenhum provedor, e a configuração do espaço ─────────────────────────────

  it("sem AiProvider e sem IA de requisitos, é o 400 de sempre", async () => {
    const res = await cliente("desligada").post(caminho(), pedido());
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toBe(
      "Nenhum provedor de IA configurado. Acesse Configurações → Provedores de IA.",
    );
    expect(ia.chamadas).toHaveLength(0);
  });

  it("com a melhoria desligada na configuração do espaço, a rota volta ao comportamento antigo", async () => {
    await gravarConfig({...CONFIG_IA_PADRAO, melhoria_ativa: false});

    const res = await cliente("aviao").post(caminho(), pedido());
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toContain("Nenhum provedor de IA configurado");
    expect(ia.chamadas).toHaveLength(0);
  });

  it("desligar o texto fantasma e a análise não desliga o botão", async () => {
    await gravarConfig({...CONFIG_IA_PADRAO, fantasma_ativo: false, analise_ativa: false});

    const res = await cliente("aviao").post(caminho(), pedido());
    expect(res.status).toBe(200);
    expect((await res.json()).response).toBe(MELHORADO);
  });

  it("com a melhoria desligada mas AiProvider cadastrado, o provedor do espaço continua valendo", async () => {
    await gravarConfig({...CONFIG_IA_PADRAO, melhoria_ativa: false});
    await cadastrarProvedor();

    const res = await cliente("aviao").post(caminho(), pedido());
    expect(res.status).toBe(200);
    expect((await res.json()).response).toBe(MELHORADO_PELO_CADASTRADO);
  });

  it("texto vazio é 400 e não chega a provedor nenhum", async () => {
    await cadastrarProvedor();
    const res = await cliente("aviao").post(caminho(), pedido({content: "<p></p>"}));
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toBe("Nenhum texto para melhorar.");
    expect(cadastrado.chamadas).toHaveLength(0);
    expect(ia.chamadas).toHaveLength(0);
  });

  // ── A IA de requisitos pode falhar ──────────────────────────────────────────

  it("serviço de requisitos com erro devolve 502 com um aviso legível", async () => {
    ia.definirModo("erro");
    const res = await cliente("aviao").post(caminho(), pedido());

    expect(res.status).toBe(502);
    expect((await res.json()).detail).toContain("não devolveu um texto melhorado");
    expect(ia.chamadas.some((c) => c.caminho === "/melhorar")).toBe(true);
  });

  it("serviço de requisitos lento estoura o tempo limite e não segura quem clicou", async () => {
    ia.definirModo("lento");
    const inicio = Date.now();
    const res = await cliente("aviao").post(caminho(), pedido());
    const decorrido = Date.now() - inicio;

    expect(res.status).toBe(502);
    // Cortou pelo tempo limite (800 ms) e não esperou o modelo (2,5 s).
    expect(decorrido).toBeLessThan(DEMORA_MS);
  });

  it("serviço que responde texto vazio não substitui o que a pessoa escreveu", async () => {
    ia.definirModo("vazio");
    const res = await cliente("aviao").post(caminho(), pedido());

    expect(res.status).toBe(502);
    const corpo = await res.json();
    expect(corpo.response).toBeUndefined();
    expect(corpo.detail).toContain("não devolveu um texto melhorado");
  });

  // ── Trilha LGPD ─────────────────────────────────────────────────────────────

  /** O evento de saída de texto gravado depois de `marco`, para este espaço. */
  async function trilhaDeSaida(marco: Date) {
    return esperarAte(() =>
      prisma.auditLog.findFirst({
        where: {workspaceId, action: "export", actorId: usuarioId, createdAt: {gte: marco}},
        orderBy: {createdAt: "desc"},
      }),
    );
  }

  it("registra na trilha que o texto saiu pela IA de requisitos, sem copiar o texto", async () => {
    await prisma.auditLog.deleteMany({where: {workspaceId}});
    const marco = new Date();

    const res = await cliente("aviao").post(caminho(), pedido({project_id: projetoId, issue_id: chamadoId}));
    expect(res.status).toBe(200);

    const registro = await trilhaDeSaida(marco);
    expect(registro).not.toBeNull();
    expect(registro!.entity).toBe("issue");
    expect(registro!.entityId).toBe(chamadoId);

    const meta = registro!.metadata as Record<string, unknown>;
    expect(meta.servico).toBe("ia-requisitos");
    expect(meta.operacao).toBe("melhoria");
    expect(meta.formato).toBe("aviao");
    expect(meta.destino).toBe(new URL(ia.base).host);
    expect(meta.campo).toBe("comentario");
    expect(meta.projeto_id).toBe(projetoId);
    expect(meta.chamado_id).toBe(chamadoId);
    expect(meta.caracteres_enviados).toBe(TEXTO.length);
    expect(meta.comentarios_enviados).toBe(1);

    // A trilha diz que saiu; ela não é uma segunda cópia do que saiu.
    const gravado = JSON.stringify({changes: registro!.changes, metadata: registro!.metadata});
    expect(gravado).not.toContain("o total do rodape ta errado");
    expect(gravado).not.toContain("Acontece desde a atualização");
    expect(gravado).not.toContain("chave-secreta-do-servidor");
  });

  it("o provedor cadastrado também deixa trilha, e o texto não vai junto", async () => {
    await cadastrarProvedor();
    await prisma.auditLog.deleteMany({where: {workspaceId}});
    const marco = new Date();

    const res = await cliente("aviao").post(caminho(), pedido());
    expect(res.status).toBe(200);

    const registro = await trilhaDeSaida(marco);
    expect(registro).not.toBeNull();
    // Sem chamado nem projeto informados, o evento fica no espaço de trabalho.
    expect(registro!.entity).toBe("workspace");
    expect(registro!.entityId).toBe(workspaceId);

    const meta = registro!.metadata as Record<string, unknown>;
    expect(meta.servico).toBe("ai-provider");
    expect(meta.operacao).toBe("melhoria");
    expect(meta.formato).toBe("openai");
    expect(meta.destino).toBe(new URL(cadastrado.base).host);

    const gravado = JSON.stringify({changes: registro!.changes, metadata: registro!.metadata});
    expect(gravado).not.toContain("o total do rodape ta errado");
    expect(gravado).not.toContain("chave-do-provedor-cadastrado");
  });

  it("sem provedor nenhum não há o que registrar: nada saiu da aplicação", async () => {
    await prisma.auditLog.deleteMany({where: {workspaceId}});
    const marco = new Date();

    const res = await cliente("desligada").post(caminho(), pedido());
    expect(res.status).toBe(400);

    await Bun.sleep(300);
    expect(await prisma.auditLog.count({where: {workspaceId, action: "export", createdAt: {gte: marco}}})).toBe(0);
  });
});
