/**
 * Os campos estruturados do chamado dentro do contexto mandado à IA.
 *
 * O checklist da Aula 18-3 é uma lista de papel e cobra do texto a entidade, a
 * prioridade e o prazo. Neste produto os três são **seletores da modal**: cobrar
 * na descrição o que já está preenchido no campo ao lado é pedir para digitar
 * duas vezes, e derruba a nota de um chamado correto. Por isso eles viajam no
 * `contexto` — `entidade`, `prioridade`, `prazo` e `tipo` —, e é o serviço de IA
 * que, vendo-os preenchidos, deixa de cobrar o item.
 *
 * As **três** rotas avaliam o mesmo chamado e por isso mandam os mesmos campos:
 * a sugestão (texto fantasma), a análise (ao salvar) e a melhoria ("Melhorar com
 * IA"). Cada teste confere o corpo que chegou ao serviço falso, não a resposta.
 *
 * A técnica é a do vizinho `ia-sugestao-de-requisito.test.ts`: um serviço de IA
 * falso local (`Bun.serve`, porta 0) guarda o que recebeu, e a API sobe em
 * processo próprio apontada para ele — a configuração do provedor vive no
 * processo do servidor.
 */

import {afterAll, beforeAll, describe, expect, it} from "bun:test";
import prisma from "@db";
import {
  addLabelToIssue,
  apiClient,
  createApiToken,
  createEntity,
  createIssue,
  createLabel,
  createProject,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";
import {cleanDb} from "@tests/helpers/setup";
import {seedWorkflowRoles} from "@utils/permissions";
import path from "path";

// ── Serviço de IA falso ───────────────────────────────────────────────────────

type ChamadaIa = {caminho: string; corpo: any};

const SUGESTAO = "O sistema deve recalcular o total do rodapé somando apenas as linhas visíveis.";
const MELHORADO = "<p>O sistema deve somar no rodapé apenas as linhas visíveis do filtro.</p>";

function iniciarIaFalsa() {
  const chamadas: ChamadaIa[] = [];

  /** Uma resposta mínima por rota: aqui o que importa é o que CHEGOU. */
  const RESPOSTA_POR_CAMINHO: Record<string, unknown> = {
    "/sugerir": {sugestao: SUGESTAO, faltando: [], confianca: 0.9},
    "/analisar": {aceitacao: 70, blocos: [{bloco: "Identificação", percentual: 100, faltando: []}]},
    "/melhorar": {texto: MELHORADO, mudou: true},
  };

  const servidor = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      chamadas.push({caminho: url.pathname, corpo: await req.json().catch(() => ({}))});
      const resposta = RESPOSTA_POR_CAMINHO[url.pathname];
      if (!resposta) return new Response("caminho desconhecido", {status: 404});
      return Response.json(resposta);
    },
  });

  return {
    base: `http://localhost:${servidor.port}`,
    /** O contexto que chegou naquela rota — o objeto sob julgamento. */
    contextoDe: (caminho: string) => chamadas.find((c) => c.caminho === caminho)?.corpo?.contexto,
    limpar: () => {
      chamadas.length = 0;
    },
    parar: () => servidor.stop(true),
  };
}

// ── A API, em processo próprio ────────────────────────────────────────────────

const RAIZ_API = path.resolve(import.meta.dir, "../..");

async function portaLivre(): Promise<number> {
  const tampao = Bun.serve({port: 0, fetch: () => new Response("")});
  // Servidor no ar tem porta; `port` só é opcional no tipo.
  const porta = tampao.port!;
  tampao.stop(true);
  return porta;
}

async function esperarSaude(porta: number) {
  for (let tentativa = 0; tentativa < 100; tentativa++) {
    const ok = await fetch(`http://localhost:${porta}/api/v1/health/`)
      .then((r) => r.ok)
      .catch(() => false);
    if (ok) return;
    await Bun.sleep(100);
  }
  throw new Error(`A API de teste não subiu na porta ${porta}.`);
}

async function subirApi(configuracao: Record<string, string>) {
  const porta = await portaLivre();
  const processo = Bun.spawn(["bun", "run", "src/index.ts"], {
    cwd: RAIZ_API,
    env: {...process.env, PORT: String(porta), ...configuracao},
    stdout: "pipe",
    stderr: "pipe",
  });
  await esperarSaude(porta);
  return {base: `http://localhost:${porta}/api/v1`, parar: () => processo.kill()};
}

// ── Cenário ───────────────────────────────────────────────────────────────────

describe("Campos estruturados do chamado no contexto da IA", () => {
  const ia = iniciarIaFalsa();
  let api: {base: string; parar: () => void};

  let slug: string;
  let projetoId: string;
  /** O chamado com os quatro campos preenchidos na modal. */
  let chamadoId: string;
  /** O chamado sem entidade, sem prazo e sem classificação. */
  let chamadoCruId: string;
  let entidadeId: string;
  let token: string;

  /** O prazo gravado no chamado — o que a modal escolheu no seletor de data. */
  const PRAZO = new Date("2026-09-30T00:00:00.000Z");
  const PRAZO_ISO = PRAZO.toISOString();

  const caminhoSugestao = () => `/workspaces/${slug}/ia/sugestao-de-requisito/`;
  const caminhoAnalise = () => `/workspaces/${slug}/ia/analise-de-chamado/`;
  const caminhoMelhoria = () => `/workspaces/${slug}/ai-assistant/improve-text/`;

  const pedidoDeSugestao = (extra: Record<string, unknown> = {}) => ({
    campo: "comentario",
    texto_atual: "O total do rodapé está errado quando ",
    cursor: 35,
    project_id: projetoId,
    issue_id: chamadoId,
    ...extra,
  });

  const pedidoDeAnalise = (extra: Record<string, unknown> = {}) => ({
    campo: "chamado",
    titulo: "[Folha] Total do rodapé diverge do somatório das linhas",
    descricao: "Ao filtrar por secretaria, o rodapé continua somando as linhas escondidas.",
    project_id: projetoId,
    issue_id: chamadoId,
    ...extra,
  });

  const pedidoDeMelhoria = (extra: Record<string, unknown> = {}) => ({
    content: "<p>o total do rodape ta errado quando filtra por secretaria</p>",
    campo: "descricao",
    project_id: projetoId,
    issue_id: chamadoId,
    ...extra,
  });

  beforeAll(async () => {
    await cleanDb();

    const dono = await createUser();
    token = (await createApiToken(dono.id)).token;
    const ws = await createWorkspace(dono.id);
    slug = ws.slug;

    const projeto = await createProject(ws.id, dono.id, {name: "Recursos Humanos"});
    projetoId = projeto.id;

    const entidade = await createEntity(ws.id, {name: "Prefeitura de Içara"});
    entidadeId = entidade.id;

    // O chamado completo: entidade, prioridade e prazo escolhidos na modal, e o
    // tipo saindo da etiqueta, como no resto do fork.
    const chamado = await createIssue(projeto.id, ws.id, {
      name: "[Folha] Total do rodapé diverge do somatório das linhas",
      entityId: entidade.id,
      priority: "urgent",
      targetDate: PRAZO,
      descriptionStripped: "Ao filtrar por secretaria, o rodapé continua somando as linhas escondidas.",
      createdById: dono.id,
    });
    chamadoId = chamado.id;
    const rotulo = await createLabel(projeto.id, ws.id, {name: "Correção"});
    await addLabelToIssue(chamado.id, rotulo.id, projeto.id, ws.id);

    // O chamado cru: nenhum seletor tocado. `priority` nasce "none" no banco.
    const cru = await createIssue(projeto.id, ws.id, {
      name: "Não consigo emitir a folha",
      createdById: dono.id,
    });
    chamadoCruId = cru.id;

    await seedWorkflowRoles(prisma, ws.id);

    api = await subirApi({
      IA_REQUISITOS_URL: ia.base,
      IA_REQUISITOS_FORMATO: "aviao",
      IA_REQUISITOS_CHAVE: "chave-secreta-do-servidor",
      IA_REQUISITOS_MODELO: "qwen3.5-4b",
    });
  });

  afterAll(() => {
    api?.parar();
    ia.parar();
  });

  const cliente = () => apiClient(token, api.base);

  // ── O chamado salvo tem os campos ───────────────────────────────────────────

  it("sugestão: o chamado salvo manda entidade, prioridade, prazo e tipo", async () => {
    ia.limpar();
    const res = await cliente().post(caminhoSugestao(), pedidoDeSugestao());
    expect(res.status).toBe(200);

    const ctx = ia.contextoDe("/sugerir");
    expect(ctx.entidade).toBe("Prefeitura de Içara");
    expect(ctx.prioridade).toBe("Urgente");
    expect(ctx.prazo).toBe(PRAZO_ISO);
    expect(ctx.tipo).toBe("correcao");
  });

  it("análise: a mesma rota do salvar manda os mesmos quatro campos", async () => {
    ia.limpar();
    const res = await cliente().post(caminhoAnalise(), pedidoDeAnalise());
    expect(res.status).toBe(200);

    const ctx = ia.contextoDe("/analisar");
    expect(ctx.entidade).toBe("Prefeitura de Içara");
    expect(ctx.prioridade).toBe("Urgente");
    expect(ctx.prazo).toBe(PRAZO_ISO);
    expect(ctx.tipo).toBe("correcao");
  });

  it("melhoria: o 'Melhorar com IA' manda os mesmos quatro campos", async () => {
    ia.limpar();
    const res = await cliente().post(caminhoMelhoria(), pedidoDeMelhoria());
    expect(res.status).toBe(200);

    const ctx = ia.contextoDe("/melhorar");
    expect(ctx.entidade).toBe("Prefeitura de Içara");
    expect(ctx.prioridade).toBe("Urgente");
    expect(ctx.prazo).toBe(PRAZO_ISO);
    expect(ctx.tipo).toBe("correcao");
  });

  // ── O chamado que não tem ───────────────────────────────────────────────────

  it("chamado sem entidade, sem prazo e sem etiqueta manda os campos nulos", async () => {
    ia.limpar();
    const res = await cliente().post(caminhoSugestao(), pedidoDeSugestao({issue_id: chamadoCruId}));
    expect(res.status).toBe(200);

    const ctx = ia.contextoDe("/sugerir");
    expect(ctx.entidade).toBeNull();
    expect(ctx.prazo).toBeNull();
    expect(ctx.tipo).toBeNull();
    // Ausência de prioridade tem nome no seletor: o banco guarda "none" por
    // padrão, e é isso que o campo mostra a quem abriu o chamado.
    expect(ctx.prioridade).toBe("Nenhum");
  });

  it("sem chamado e sem nada informado, os quatro campos vão nulos", async () => {
    ia.limpar();
    const res = await cliente().post(caminhoSugestao(), pedidoDeSugestao({issue_id: null}));
    expect(res.status).toBe(200);

    const ctx = ia.contextoDe("/sugerir");
    expect(ctx.entidade).toBeNull();
    expect(ctx.prioridade).toBeNull();
    expect(ctx.prazo).toBeNull();
    expect(ctx.tipo).toBeNull();
    // Ausência é ausência: nada de campo sumido do corpo.
    expect(Object.keys(ctx)).toEqual(expect.arrayContaining(["entidade", "prioridade", "prazo", "tipo"]));
  });

  it("valor que não é prioridade não vira prioridade", async () => {
    ia.limpar();
    const res = await cliente().post(
      caminhoSugestao(),
      pedidoDeSugestao({issue_id: null, contexto: {prioridade: "urgentíssimo", prazo: "semana que vem"}}),
    );
    expect(res.status).toBe(200);

    const ctx = ia.contextoDe("/sugerir");
    expect(ctx.prioridade).toBeNull();
    expect(ctx.prazo).toBeNull();
  });

  // ── Na criação, quem informa é a tela ───────────────────────────────────────

  it("sugestão na criação: prioridade, prazo, entidade e tipo saem da modal", async () => {
    ia.limpar();
    const res = await cliente().post(
      caminhoSugestao(),
      pedidoDeSugestao({
        campo: "descricao",
        issue_id: null,
        tipo: "melhoria",
        entity_id: entidadeId,
        contexto: {prioridade: "high", prazo: "2026-10-15"},
      }),
    );
    expect(res.status).toBe(200);

    const ctx = ia.contextoDe("/sugerir");
    expect(ctx.entidade).toBe("Prefeitura de Içara");
    expect(ctx.prioridade).toBe("Alta");
    expect(ctx.prazo).toBe("2026-10-15T00:00:00.000Z");
    expect(ctx.tipo).toBe("melhoria");
  });

  it("análise na criação: o chamado ainda não existe e os campos vêm da tela", async () => {
    ia.limpar();
    const res = await cliente().post(
      caminhoAnalise(),
      pedidoDeAnalise({
        issue_id: null,
        tipo: "correcao",
        entity_id: entidadeId,
        contexto: {prioridade: "Baixa", prazo: "2026-11-20"},
      }),
    );
    expect(res.status).toBe(200);

    const ctx = ia.contextoDe("/analisar");
    expect(ctx.entidade).toBe("Prefeitura de Içara");
    // A tela pode mandar a chave do banco ou o rótulo que ela mesma mostra.
    expect(ctx.prioridade).toBe("Baixa");
    expect(ctx.prazo).toBe("2026-11-20T00:00:00.000Z");
    expect(ctx.tipo).toBe("correcao");
  });

  it("melhoria sem chamado: o que a tela sabe vira prioridade e prazo", async () => {
    ia.limpar();
    const res = await cliente().post(
      caminhoMelhoria(),
      pedidoDeMelhoria({
        issue_id: null,
        context: {priority: "medium", target_date: "2026-12-01"},
      }),
    );
    expect(res.status).toBe(200);

    const ctx = ia.contextoDe("/melhorar");
    expect(ctx.prioridade).toBe("Média");
    expect(ctx.prazo).toBe("2026-12-01T00:00:00.000Z");
  });

  // ── Com chamado salvo, o banco vence ────────────────────────────────────────

  it("sugestão: o chamado salvo vence o que a tela informou", async () => {
    ia.limpar();
    const res = await cliente().post(
      caminhoSugestao(),
      pedidoDeSugestao({
        tipo: null,
        contexto: {prioridade: "low", prazo: "2030-01-01", entidade: "Prefeitura Inventada"},
      }),
    );
    expect(res.status).toBe(200);

    const ctx = ia.contextoDe("/sugerir");
    expect(ctx.prioridade).toBe("Urgente");
    expect(ctx.prazo).toBe(PRAZO_ISO);
    expect(ctx.entidade).toBe("Prefeitura de Içara");
    expect(ctx.tipo).toBe("correcao");
  });

  it("o tipo é a exceção: dito pela tela, é o dito que vale", async () => {
    ia.limpar();
    // A etiqueta trocada na modal ainda não foi gravada; nos outros três campos
    // a tela é reserva, aqui ela é a informação mais nova que existe.
    const res = await cliente().post(caminhoSugestao(), pedidoDeSugestao({tipo: "melhoria"}));
    expect(res.status).toBe(200);

    const ctx = ia.contextoDe("/sugerir");
    expect(ctx.tipo).toBe("melhoria");
    expect(ctx.prioridade).toBe("Urgente");
  });

  it("análise: o chamado salvo vence o que a tela informou", async () => {
    ia.limpar();
    const res = await cliente().post(
      caminhoAnalise(),
      pedidoDeAnalise({contexto: {prioridade: "low", prazo: "2030-01-01", entidade: "Prefeitura Inventada"}}),
    );
    expect(res.status).toBe(200);

    const ctx = ia.contextoDe("/analisar");
    expect(ctx.prioridade).toBe("Urgente");
    expect(ctx.prazo).toBe(PRAZO_ISO);
    expect(ctx.entidade).toBe("Prefeitura de Içara");
  });

  it("melhoria: o chamado salvo vence o que a tela informou", async () => {
    ia.limpar();
    const res = await cliente().post(
      caminhoMelhoria(),
      pedidoDeMelhoria({context: {priority: "low", target_date: "2030-01-01"}}),
    );
    expect(res.status).toBe(200);

    const ctx = ia.contextoDe("/melhorar");
    expect(ctx.prioridade).toBe("Urgente");
    expect(ctx.prazo).toBe(PRAZO_ISO);
  });

  it("chamado salvo sem prazo ainda aproveita o prazo escolhido na tela", async () => {
    ia.limpar();
    const res = await cliente().post(
      caminhoSugestao(),
      pedidoDeSugestao({issue_id: chamadoCruId, contexto: {prazo: "2027-03-05"}}),
    );
    expect(res.status).toBe(200);

    // Nada foi gravado ainda; o que a tela sabe é a única informação que existe.
    expect(ia.contextoDe("/sugerir").prazo).toBe("2027-03-05T00:00:00.000Z");
  });
});
