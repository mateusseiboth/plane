/**
 * IA de levantamento de requisitos — a análise do chamado no momento de salvar,
 * e a configuração por espaço de trabalho que liga ou desliga cada parte.
 *
 * Duas coisas mandam nestes testes, as mesmas do vizinho
 * `ia-sugestao-de-requisito.test.ts`:
 *
 *  - **Nada aqui toca o serviço de IA de verdade.** Um servidor falso local
 *    (`Bun.serve`, porta 0) faz o papel do worker, respondendo nos quatro
 *    formatos de provedor e sabendo falhar, demorar e devolver prosa.
 *  - **A configuração do PROVEDOR vive no processo do servidor**, então cada
 *    cenário sobe uma instância própria da API apontando para o falso. Já a
 *    configuração do ESPAÇO DE TRABALHO vive no banco e é lida a cada chamada:
 *    ligar e desligar não exige reiniciar nada.
 *
 * O que está coberto: análise com a IA desligada no servidor e desligada no
 * espaço, IA com erro, IA lenta, os quatro provedores, cada chave da
 * configuração, leitura e escrita da configuração com permissão certa e errada,
 * JSON corrompido no banco, permissão da análise e trilha LGPD.
 */

import {afterAll, beforeAll, beforeEach, describe, expect, it} from "bun:test";
import prisma from "@db";
import {
  addMember,
  apiClient,
  createApiToken,
  createEntity,
  createIssue,
  createLabel,
  createMemberWithToken,
  createProject,
  createUser,
  createWorkspace,
  addLabelToIssue,
} from "@tests/helpers/factory";
import {cleanDb} from "@tests/helpers/setup";
import {CHAVE_CONFIG_IA, CONFIG_IA_PADRAO, type ConfigIaDoEspaco} from "@modules/ia-requisitos/configuracao";
import {seedWorkflowRoles} from "@utils/permissions";
import {saveAsset} from "@utils/storage";
import path from "path";

// ── Servidor de IA falso ──────────────────────────────────────────────────────

type ChamadaIa = {caminho: string; corpo: any; chave: string | null; autorizacao: string | null};

type ModoIa = "ok" | "erro" | "lento" | "prosa" | "sem-nota";

const SUGESTAO = "O sistema deve recalcular o total do rodapé somando apenas as linhas visíveis.";
const TEXTO_DO_PRINT = "Erro 500 ao salvar o lançamento";
/** Quanto o modo "lento" demora — bem acima de qualquer tempo limite de teste. */
const DEMORA_MS = 2500;

const BLOCOS = [
  {bloco: "Identificação", percentual: 100, faltando: []},
  {bloco: "Números", percentual: 0, faltando: ["Falta um exemplo numérico mostrando a conta."]},
];
const PORQUES = ["Por que o total sai errado? Porque o filtro não exclui as linhas escondidas."];
const FEEDBACK = "Falta o exemplo numérico e um critério de aceite em DADO / QUANDO / ENTÃO.";
const SUGESTOES = ["DADO 3 linhas visíveis somando 300, QUANDO o filtro for aplicado, ENTÃO o rodapé deve exibir 300."];

/** O que o serviço nativo devolve: a nota sai do checklist determinístico dele. */
const ANALISE_NATIVA = {aceitacao: 62, blocos: BLOCOS, porques: PORQUES, feedback: FEEDBACK, sugestoes: SUGESTOES};
/**
 * O que um modelo genérico devolve. A nota vem propositalmente errada (99): para
 * quem não é o provedor nativo, ela é DESCARTADA e recalculada dos blocos —
 * (100 + 0) / 2 = 50 —, senão o medidor da tela contradiria a lista de baixo.
 */
const ANALISE_DO_MODELO = {...ANALISE_NATIVA, aceitacao: 99};
const ACEITACAO_DOS_BLOCOS = 50;

function iniciarIaFalsa() {
  const chamadas: ChamadaIa[] = [];
  let modo: ModoIa = "ok";

  /** A régua da análise só viaja no prompt de quem não é o provedor nativo. */
  const pedeAnalise = (corpo: unknown) => JSON.stringify(corpo ?? {}).includes("Cinco porquês");

  const RESPOSTA_POR_CAMINHO: Record<string, (analise: boolean) => unknown> = {
    // Formato nativo do contrato: cada rota já devolve tudo pronto.
    "/sugerir": () => ({sugestao: SUGESTAO, faltando: [], confianca: 0.82}),
    "/analisar": () => ANALISE_NATIVA,
    // OpenAI: JSON dentro de choices[0].message.content.
    "/v1/chat/completions": (analise) => ({
      choices: [{message: {role: "assistant", content: JSON.stringify(analise ? ANALISE_DO_MODELO : {sugestao: SUGESTAO})}}],
    }),
    // llama.cpp: JSON dentro de .content, embrulhado em cerca de código — que é
    // como o modelo costuma responder de verdade.
    "/completion": (analise) => ({
      content: "```json\n" + JSON.stringify(analise ? ANALISE_DO_MODELO : {sugestao: SUGESTAO}) + "\n```",
    }),
    // Ollama: JSON dentro de .message.content.
    "/api/chat": (analise) => ({
      message: {role: "assistant", content: JSON.stringify(analise ? ANALISE_DO_MODELO : {sugestao: SUGESTAO})},
    }),
  };

  const servidor = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const chave = req.headers.get("x-api-key");
      const autorizacao = req.headers.get("authorization");

      if (url.pathname === "/ocr") {
        await req.formData().catch(() => null);
        chamadas.push({caminho: "/ocr", corpo: null, chave, autorizacao});
        return Response.json({texto_extraido: TEXTO_DO_PRINT});
      }

      const corpo = await req.json().catch(() => ({}));
      chamadas.push({caminho: url.pathname, corpo, chave, autorizacao});

      if (modo === "erro") return new Response("modelo caiu", {status: 500});
      if (modo === "lento") await Bun.sleep(DEMORA_MS);
      if (modo === "prosa") {
        // Modelo que ignorou o pedido de JSON. Análise vazia vale mais que
        // análise inventada, então a rota tem de descartar isto.
        return Response.json({choices: [{message: {content: "Claro! O chamado está ótimo."}}]});
      }
      if (modo === "sem-nota") {
        // O serviço analisou mas o checklist não fechou nota. `null` é "não
        // tenho nota" — nunca zero, que na tela é outra coisa.
        return Response.json({aceitacao: null, blocos: [], porques: [], feedback: FEEDBACK, sugestoes: []});
      }

      const monta = RESPOSTA_POR_CAMINHO[url.pathname];
      if (!monta) return new Response("caminho desconhecido", {status: 404});
      return Response.json(monta(url.pathname === "/analisar" || pedeAnalise(corpo)));
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

// ── Instâncias da API, uma por configuração de provedor ───────────────────────

const RAIZ_API = path.resolve(import.meta.dir, "../..");

type ApiDeTeste = {base: string; parar: () => void};

async function portaLivre(): Promise<number> {
  const tampao = Bun.serve({port: 0, fetch: () => new Response("")});
  const porta = tampao.port;
  tampao.stop(true);
  if (!porta) throw new Error("Bun.serve não devolveu uma porta livre.");
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

describe("IA de análise de chamado", () => {
  const ia = iniciarIaFalsa();
  const apis: Record<string, ApiDeTeste> = {};

  let workspaceId: string;
  let slug: string;
  let projetoId: string;
  let chamadoId: string;
  let token: string;
  let tokenAtendimento: string;
  let tokenVisualizador: string;
  let usuarioId: string;

  const caminho = () => `/workspaces/${slug}/ia/analise-de-chamado/`;
  const caminhoDaConfig = () => `/workspaces/${slug}/ia/configuracao/`;
  const caminhoDoFantasma = () => `/workspaces/${slug}/ia/sugestao-de-requisito/`;

  /** Pedido completo, do jeito que a modal manda ao clicar em salvar. */
  const pedido = (extra: Record<string, unknown> = {}) => ({
    campo: "chamado",
    titulo: "[Folha] Total do rodapé diverge do somatório das linhas",
    descricao: "Ao filtrar por secretaria, o rodapé continua somando as linhas escondidas.",
    project_id: projetoId,
    issue_id: chamadoId,
    ...extra,
  });

  /** Grava a configuração do espaço direto no banco — é de onde a rota lê. */
  async function gravarConfig(valor: unknown) {
    await prisma.workspaceSetting.upsert({
      where: {workspaceId_key: {workspaceId, key: CHAVE_CONFIG_IA}},
      create: {workspaceId, key: CHAVE_CONFIG_IA, value: valor as any},
      update: {value: valor as any},
    });
  }

  async function configGravada(): Promise<unknown> {
    const registro = await prisma.workspaceSetting.findFirst({where: {workspaceId, key: CHAVE_CONFIG_IA}});
    return registro?.value;
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

    // Anexo com imagem de verdade no storage, para o caminho do OCR rodar
    // inteiro também na análise (banco → storage → /ocr → contexto).
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
    const [desligada, aviao, openai, llamacpp, ollama] = await Promise.all([
      subirApi("desligada", {IA_REQUISITOS_URL: ""}),
      subirApi("aviao", {...comum, IA_REQUISITOS_URL: ia.base, IA_REQUISITOS_FORMATO: "aviao", IA_REQUISITOS_TIMEOUT_MS: "800"}),
      subirApi("openai", {...comum, IA_REQUISITOS_URL: ia.base, IA_REQUISITOS_FORMATO: "openai"}),
      subirApi("llamacpp", {...comum, IA_REQUISITOS_URL: ia.base, IA_REQUISITOS_FORMATO: "llamacpp"}),
      subirApi("ollama", {...comum, IA_REQUISITOS_URL: ia.base, IA_REQUISITOS_FORMATO: "ollama"}),
    ]);
    Object.assign(apis, {desligada, aviao, openai, llamacpp, ollama});
  });

  afterAll(() => {
    for (const api of Object.values(apis)) api.parar();
    ia.parar();
  });

  // Cada teste começa do estado de fábrica: a configuração vive no banco e é
  // lida a cada chamada, então um cenário não pode vazar para o seguinte.
  beforeEach(async () => {
    ia.limpar();
    await prisma.workspaceSetting.deleteMany({where: {workspaceId, key: CHAVE_CONFIG_IA}});
  });

  const cliente = (nome: string, chaveDeAcesso = token) => apiClient(chaveDeAcesso, apis[nome]!.base);

  // ── A IA pode não estar lá ──────────────────────────────────────────────────

  it("sem IA configurada responde 200 sem nota e não chama ninguém", async () => {
    const res = await cliente("desligada").post(caminho(), pedido());
    expect(res.status).toBe(200);

    const corpo = await res.json();
    expect(corpo).toMatchObject({aceitacao: null, blocos: [], porques: [], feedback: "", sugestoes: []});
    // Sem nota a tela não bloqueia, nem no modo `exigir`.
    expect(corpo.analisado).toBe(false);
    expect(ia.chamadas).toHaveLength(0);
  });

  it("IA com erro devolve 200 sem nota", async () => {
    ia.definirModo("erro");
    const res = await cliente("aviao").post(caminho(), pedido());
    ia.definirModo("ok");

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({aceitacao: null, blocos: [], analisado: false});
    expect(ia.chamadas.some((c) => c.caminho === "/analisar")).toBe(true);
  });

  it("IA lenta estoura o tempo limite e devolve 200 sem nota", async () => {
    ia.definirModo("lento");
    const inicio = Date.now();
    const res = await cliente("aviao").post(caminho(), pedido());
    const decorrido = Date.now() - inicio;
    ia.definirModo("ok");

    expect(res.status).toBe(200);
    expect((await res.json()).aceitacao).toBeNull();
    // Cortou pelo tempo limite (800 ms) e não esperou o modelo (2,5 s).
    expect(decorrido).toBeLessThan(DEMORA_MS);
  });

  it("serviço que devolve aceitacao null não vira nota zero", async () => {
    ia.definirModo("sem-nota");
    const res = await cliente("aviao").post(caminho(), pedido());
    ia.definirModo("ok");

    expect(res.status).toBe(200);
    const corpo = await res.json();
    // Zero seria "reprovado"; null é "não tenho nota" — e sem nota não se bloqueia.
    expect(corpo.aceitacao).toBeNull();
    expect(corpo.analisado).toBe(false);
    // O que veio de útil continua chegando à tela.
    expect(corpo.feedback).toBe(FEEDBACK);
  });

  it("modelo que responde prosa em vez de JSON não vira análise", async () => {
    ia.definirModo("prosa");
    const res = await cliente("openai").post(caminho(), pedido());
    ia.definirModo("ok");

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({aceitacao: null, blocos: [], feedback: "", analisado: false});
  });

  // ── Um provedor por formato ─────────────────────────────────────────────────

  it("provedor aviao usa o /analisar do contrato, autentica com X-API-Key e respeita a nota do serviço", async () => {
    const res = await cliente("aviao").post(caminho(), pedido());
    expect(res.status).toBe(200);

    const corpo = await res.json();
    // A nota do provedor nativo sai do checklist determinístico dele.
    expect(corpo.aceitacao).toBe(62);
    expect(corpo.analisado).toBe(true);
    expect(corpo.blocos).toEqual(BLOCOS);
    expect(corpo.porques).toEqual(PORQUES);
    expect(corpo.feedback).toBe(FEEDBACK);
    expect(corpo.sugestoes).toEqual(SUGESTOES);

    const chamada = ia.chamadas.find((c) => c.caminho === "/analisar")!;
    expect(chamada).toBeDefined();
    // A credencial sai do servidor, nunca do navegador.
    expect(chamada.chave).toBe("chave-secreta-do-servidor");
    expect(chamada.corpo.campo).toBe("chamado");
    expect(chamada.corpo.titulo).toBe("[Folha] Total do rodapé diverge do somatório das linhas");
    expect(chamada.corpo.descricao).toContain("rodapé continua somando as linhas escondidas");
    // O anexo chega com o texto extraído do print pelo /ocr do worker.
    expect(chamada.corpo.contexto.anexos).toEqual([{nome: "erro.png", texto_extraido: TEXTO_DO_PRINT}]);
    expect(chamada.corpo.contexto.tipo).toBe("correcao");
    // Título e descrição já viajam no corpo: repeti-los no contexto só duplicaria.
    expect(chamada.corpo.contexto.titulo).toBeUndefined();
    expect(chamada.corpo.contexto.descricao).toBeUndefined();
  });

  it("provedor openai lê a análise de choices[0].message.content e recalcula a nota pelos blocos", async () => {
    const res = await cliente("openai").post(caminho(), pedido());
    expect(res.status).toBe(200);

    const corpo = await res.json();
    // O 99 que o modelo mandou é descartado: a nota é a média dos blocos.
    expect(corpo.aceitacao).toBe(ACEITACAO_DOS_BLOCOS);
    expect(corpo.blocos).toEqual(BLOCOS);
    expect(corpo.feedback).toBe(FEEDBACK);

    const chamada = ia.chamadas.find((c) => c.caminho === "/v1/chat/completions")!;
    expect(chamada).toBeDefined();
    expect(chamada.autorizacao).toBe("Bearer chave-secreta-do-servidor");
    expect(chamada.corpo.model).toBe("qwen3.5-4b");
    // A metodologia da Aula 18-3 viaja no prompt para quem não é o modelo nativo.
    expect(chamada.corpo.messages[0].content).toContain("Cinco porquês");
    expect(chamada.corpo.messages[0].content).toContain("Critérios de aceite");
  });

  it("provedor llamacpp lê a análise de .content, mesmo em cerca de código", async () => {
    const res = await cliente("llamacpp").post(caminho(), pedido());
    expect(res.status).toBe(200);
    expect((await res.json()).aceitacao).toBe(ACEITACAO_DOS_BLOCOS);
    expect(ia.chamadas.some((c) => c.caminho === "/completion")).toBe(true);
  });

  it("provedor ollama lê a análise de .message.content", async () => {
    const res = await cliente("ollama").post(caminho(), pedido());
    expect(res.status).toBe(200);
    expect((await res.json()).aceitacao).toBe(ACEITACAO_DOS_BLOCOS);

    const chamada = ia.chamadas.find((c) => c.caminho === "/api/chat")!;
    expect(chamada).toBeDefined();
    expect(chamada.corpo.format).toBe("json");
  });

  // ── Comentário ──────────────────────────────────────────────────────────────

  it("no comentário o chamado salvo vira contexto, e é o comentário que é analisado", async () => {
    const res = await cliente("aviao").post(
      caminho(),
      pedido({campo: "comentario", titulo: undefined, descricao: undefined, comentario: "Continua acontecendo hoje."}),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).aceitacao).toBe(62);

    const enviado = ia.chamadas.find((c) => c.caminho === "/analisar")!.corpo;
    expect(enviado.campo).toBe("comentario");
    expect(enviado.comentario).toBe("Continua acontecendo hoje.");
    expect(enviado.contexto.titulo).toBe("[Folha] Total do rodapé diverge do somatório das linhas");
    expect(enviado.contexto.descricao).toContain("rodapé continua somando as linhas escondidas");
    expect(enviado.contexto.comentarios).toEqual(["Acontece desde a atualização de terça."]);
  });

  it("nada escrito não vira chamada à IA", async () => {
    const res = await cliente("aviao").post(caminho(), pedido({titulo: "", descricao: "   "}));
    expect(res.status).toBe(200);
    expect((await res.json()).analisado).toBe(false);
    expect(ia.chamadas).toHaveLength(0);
  });

  // ── Cada chave da configuração do espaço ────────────────────────────────────

  it("analise_ativa: false desliga a análise e não chama a IA", async () => {
    await gravarConfig({...CONFIG_IA_PADRAO, analise_ativa: false});
    const res = await cliente("aviao").post(caminho(), pedido());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({aceitacao: null, analisado: false});
    expect(ia.chamadas).toHaveLength(0);
  });

  it("analise_em_comentarios: false desliga só o comentário; o chamado continua analisado", async () => {
    await gravarConfig({...CONFIG_IA_PADRAO, analise_em_comentarios: false});

    const comentario = await cliente("aviao").post(caminho(), pedido({campo: "comentario", comentario: "Continua."}));
    expect(comentario.status).toBe(200);
    expect((await comentario.json()).analisado).toBe(false);
    expect(ia.chamadas).toHaveLength(0);

    const chamado = await cliente("aviao").post(caminho(), pedido());
    expect(chamado.status).toBe(200);
    expect((await chamado.json()).aceitacao).toBe(62);
    expect(ia.chamadas.some((c) => c.caminho === "/analisar")).toBe(true);
  });

  it("fantasma_ativo: false desliga o texto fantasma sem afetar a análise", async () => {
    await gravarConfig({...CONFIG_IA_PADRAO, fantasma_ativo: false});

    const fantasma = await cliente("aviao").post(caminhoDoFantasma(), {
      campo: "descricao",
      texto_atual: "O total do rodapé ",
      cursor: 18,
      project_id: projetoId,
      issue_id: chamadoId,
    });
    expect(fantasma.status).toBe(200);
    expect((await fantasma.json()).sugestao).toBe("");
    expect(ia.chamadas).toHaveLength(0);

    const analise = await cliente("aviao").post(caminho(), pedido());
    expect(analise.status).toBe(200);
    expect((await analise.json()).aceitacao).toBe(62);
  });

  it("com a configuração padrão (nada gravado) as duas rotas funcionam", async () => {
    const analise = await cliente("aviao").post(caminho(), pedido());
    expect(analise.status).toBe(200);
    expect((await analise.json()).analisado).toBe(true);

    const fantasma = await cliente("aviao").post(caminhoDoFantasma(), {
      campo: "descricao",
      texto_atual: "O total do rodapé ",
      cursor: 18,
      project_id: projetoId,
      issue_id: chamadoId,
    });
    expect(fantasma.status).toBe(200);
    expect((await fantasma.json()).sugestao).toBe(SUGESTAO);
  });

  // ── Leitura e escrita da configuração ───────────────────────────────────────

  it("qualquer membro lê a configuração, e sem nada gravado vêm os padrões do contrato", async () => {
    const res = await cliente("aviao", tokenVisualizador).get(caminhoDaConfig());
    expect(res.status).toBe(200);

    const corpo = await res.json();
    expect(corpo).toMatchObject(CONFIG_IA_PADRAO as unknown as Record<string, unknown>);
    expect(corpo.modo).toBe("avisar");
    expect(corpo.minimo_aceitacao).toBe(70);
    // A tela precisa saber se existe provedor; a chave e o endereço, jamais.
    expect(corpo.ia_disponivel).toBe(true);
    expect(JSON.stringify(corpo)).not.toContain("chave-secreta-do-servidor");
    expect(JSON.stringify(corpo)).not.toContain(new URL(ia.base).host);
  });

  it("com a IA desligada no servidor a leitura avisa que não há provedor", async () => {
    const res = await cliente("desligada", tokenVisualizador).get(caminhoDaConfig());
    expect(res.status).toBe(200);
    expect((await res.json()).ia_disponivel).toBe(false);
  });

  it("quem não é membro do espaço não lê a configuração", async () => {
    const estranho = await createUser();
    const tokenEstranho = (await createApiToken(estranho.id)).token;
    const res = await cliente("aviao", tokenEstranho).get(caminhoDaConfig());
    expect(res.status).toBe(403);
  });

  it("administrador grava a configuração, e a escrita é parcial", async () => {
    const res = await cliente("aviao").patch(caminhoDaConfig(), {modo: "exigir", minimo_aceitacao: 85});
    expect(res.status).toBe(200);

    const corpo = await res.json();
    expect(corpo.modo).toBe("exigir");
    expect(corpo.minimo_aceitacao).toBe(85);
    // O que não veio no corpo continua como estava.
    expect(corpo.analise_ativa).toBe(true);
    expect(corpo.mostrar_indicador).toBe(true);

    expect(await configGravada()).toMatchObject({modo: "exigir", minimo_aceitacao: 85});

    // E a próxima leitura devolve o que foi gravado.
    const lida = await cliente("aviao").get(caminhoDaConfig());
    expect((await lida.json()).modo).toBe("exigir");
  });

  it("quem não administra o espaço não grava a configuração", async () => {
    const res = await cliente("aviao", tokenAtendimento).patch(caminhoDaConfig(), {analise_ativa: false});
    expect(res.status).toBe(403);
    expect(await configGravada()).toBeUndefined();
  });

  it("valor fora do combinado não entra: modo inválido e porcentagem absurda caem no que vale", async () => {
    const res = await cliente("aviao").patch(caminhoDaConfig(), {
      modo: "explodir",
      minimo_aceitacao: 500,
      analise_ativa: "talvez",
    });
    expect(res.status).toBe(200);

    const corpo = await res.json();
    expect(corpo.modo).toBe("avisar");
    expect(corpo.minimo_aceitacao).toBe(100);
    expect(corpo.analise_ativa).toBe(true);
  });

  it("null no PATCH é 'não mexi nisso', não zero", async () => {
    await gravarConfig({...CONFIG_IA_PADRAO, minimo_aceitacao: 85});
    const res = await cliente("aviao").patch(caminhoDaConfig(), {minimo_aceitacao: null, modo: null});
    expect(res.status).toBe(200);

    const corpo = await res.json();
    expect(corpo.minimo_aceitacao).toBe(85);
    expect(corpo.modo).toBe("avisar");
  });

  it("modo exigir não faz a rota bloquear nada: quem bloqueia é a tela, e só com nota", async () => {
    await gravarConfig({...CONFIG_IA_PADRAO, modo: "exigir", minimo_aceitacao: 90});
    ia.definirModo("erro");
    const res = await cliente("aviao").post(caminho(), pedido());
    ia.definirModo("ok");

    // Serviço fora do ar no modo mais rígido: ainda é 200, e sem nota.
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({aceitacao: null, analisado: false});
  });

  // ── Banco com lixo ──────────────────────────────────────────────────────────

  it("JSON corrompido no banco não derruba a leitura nem a análise", async () => {
    // A coluna é Json, mas nada garante que o conteúdo tenha a nossa forma:
    // texto que nem JSON é, texto que vira nulo, número solto e lista.
    for (const lixo of ["{isso não é json", "null", 42, []]) {
      await gravarConfig(lixo);

      const lida = await cliente("aviao").get(caminhoDaConfig());
      expect(lida.status).toBe(200);
      expect(await lida.json()).toMatchObject(CONFIG_IA_PADRAO as unknown as Record<string, unknown>);

      const analise = await cliente("aviao").post(caminho(), pedido());
      expect(analise.status).toBe(200);
      expect((await analise.json()).aceitacao).toBe(62);
    }
  });

  it("configuração pela metade completa o que falta com os padrões", async () => {
    await gravarConfig({analise_ativa: false});
    const res = await cliente("aviao").get(caminhoDaConfig());
    expect(res.status).toBe(200);

    const corpo = (await res.json()) as ConfigIaDoEspaco;
    expect(corpo.analise_ativa).toBe(false);
    expect(corpo.fantasma_ativo).toBe(true);
    expect(corpo.modo).toBe("avisar");
    expect(corpo.minimo_aceitacao).toBe(70);
  });

  // ── Permissão da análise ────────────────────────────────────────────────────

  it("quem não pode abrir chamado no projeto recebe 403", async () => {
    const res = await cliente("aviao", tokenVisualizador).post(caminho(), pedido());
    expect(res.status).toBe(403);
    expect(ia.chamadas).toHaveLength(0);
  });

  it("Atendimento, que abre chamado pela triagem, recebe análise", async () => {
    const res = await cliente("aviao", tokenAtendimento).post(caminho(), pedido());
    expect(res.status).toBe(200);
    expect((await res.json()).aceitacao).toBe(62);
  });

  it("campo inválido é 400 e não chega à IA", async () => {
    const res = await cliente("aviao").post(caminho(), pedido({campo: "titulo"}));
    expect(res.status).toBe(400);
    expect(ia.chamadas).toHaveLength(0);
  });

  it("sem projeto e sem chamado é 400, porque não há permissão a conferir", async () => {
    const res = await cliente("aviao").post(caminho(), pedido({project_id: undefined, issue_id: undefined}));
    expect(res.status).toBe(400);
    expect(ia.chamadas).toHaveLength(0);
  });

  // ── Trilha LGPD ─────────────────────────────────────────────────────────────

  it("registra na trilha que o chamado saiu para análise, sem copiar o conteúdo", async () => {
    await prisma.auditLog.deleteMany({where: {entityId: chamadoId}});

    const marco = new Date();
    const res = await cliente("aviao").post(caminho(), pedido());
    expect(res.status).toBe(200);

    // recordAudit é assíncrono de propósito: a gravação não segura a resposta.
    const registro = await esperarAte(() =>
      prisma.auditLog.findFirst({
        // Ancorado no ator e no instante: o recordAudit é disparado sem espera,
        // então a gravação do teste anterior pode chegar depois do deleteMany.
        where: {entityId: chamadoId, action: "export", actorId: usuarioId, createdAt: {gte: marco}},
        orderBy: {createdAt: "desc"},
      }),
    );
    expect(registro).not.toBeNull();
    expect(registro!.entity).toBe("issue");
    expect(registro!.actorId).toBe(usuarioId);

    const meta = registro!.metadata as Record<string, unknown>;
    expect(meta.servico).toBe("ia-requisitos");
    // É o que separa a análise do texto fantasma na tela de Auditoria.
    expect(meta.operacao).toBe("analise");
    expect(meta.formato).toBe("aviao");
    expect(meta.destino).toBe(new URL(ia.base).host);
    expect(meta.campo).toBe("chamado");
    expect(meta.projeto_id).toBe(projetoId);
    expect(meta.chamado_id).toBe(chamadoId);
    expect(meta.caracteres_enviados).toBe(55 + 74);
    expect(meta.comentarios_enviados).toBe(1);
    expect(meta.anexos_enviados).toBe(1);
    expect(meta.anexos_com_texto).toBe(1);

    // A trilha diz que saiu; ela não é uma segunda cópia do que saiu.
    const gravado = JSON.stringify({changes: registro!.changes, metadata: registro!.metadata});
    expect(gravado).not.toContain("Total do rodapé diverge");
    expect(gravado).not.toContain(TEXTO_DO_PRINT);
    expect(gravado).not.toContain("Acontece desde a atualização");
    // Nem a credencial da IA, que nunca sai do servidor.
    expect(gravado).not.toContain("chave-secreta-do-servidor");
  });

  it("análise desligada no espaço não gera trilha: nada saiu da aplicação", async () => {
    await gravarConfig({...CONFIG_IA_PADRAO, analise_ativa: false});
    await prisma.auditLog.deleteMany({where: {entityId: chamadoId}});

    const marco = new Date();
    const res = await cliente("aviao").post(caminho(), pedido());
    expect(res.status).toBe(200);

    await Bun.sleep(300);
    expect(
      await prisma.auditLog.count({where: {entityId: chamadoId, action: "export", createdAt: {gte: marco}}}),
    ).toBe(0);
  });
});
