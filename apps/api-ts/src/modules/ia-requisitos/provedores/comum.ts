/**
 * O que todo provedor compartilha: a ida à rede que não lança, a instrução com
 * a metodologia e a leitura da resposta.
 *
 * Só o provedor nativo (`aviao`) recebe a metodologia embutida no modelo. Os
 * demais formatos são LLMs genéricos: para eles a régua da Aula 18-3 viaja no
 * prompt, e a resposta em JSON é extraída aqui.
 */

import {
  ANALISE_VAZIA,
  MELHORIA_VAZIA,
  RESPOSTA_VAZIA,
  semAvisos,
  type AceitacaoDaMelhoria,
  type AvisosDaMelhoria,
  type BlocoDaAnalise,
  type ItemFaltando,
  type PedidoAnalise,
  type PedidoIa,
  type PedidoMelhoria,
  type RespostaAnalise,
  type RespostaIa,
  type RespostaMelhoria,
} from "@modules/ia-requisitos/tipos";

/**
 * `fetch` que devolve o JSON ou `null`. Nunca lança — inclui o estouro do tempo
 * limite (`AbortSignal.timeout` → `TimeoutError`), que é o caso mais provável.
 */
export async function postarJson(opcoes: {
  url: string;
  cabecalhos: Record<string, string>;
  corpo: unknown;
  tempoLimiteMs: number;
  destino: string;
}): Promise<any | null> {
  try {
    const res = await fetch(opcoes.url, {
      method: "POST",
      headers: {"Content-Type": "application/json", ...opcoes.cabecalhos},
      body: JSON.stringify(opcoes.corpo),
      signal: AbortSignal.timeout(opcoes.tempoLimiteMs),
    });
    if (!res.ok) {
      console.warn(`[ia-requisitos] ${opcoes.destino} respondeu ${res.status}; seguindo sem sugestão.`);
      return null;
    }
    return await res.json();
  } catch (e: any) {
    console.warn(`[ia-requisitos] falha ao consultar ${opcoes.destino}:`, e?.message ?? e);
    return null;
  }
}

/**
 * O checklist da aula é uma lista de papel; aqui parte dele virou campo.
 *
 * Entidade, prioridade, prazo e tipo são seletores da modal de abrir chamado.
 * Cobrar do texto o que já está preenchido no campo ao lado é pedir para digitar
 * duas vezes — e derruba a nota de um chamado que está correto.
 */
const CAMPOS_ESTRUTURADOS = [
  "Tipo, entidade, prioridade e prazo são CAMPOS do chamado, preenchidos em seletores da modal, e chegam no contexto acima.",
  "Quando vierem preenchidos, o item correspondente do checklist está atendido: não os cobre do texto nem os liste como falta.",
].join("\n");

/**
 * A régua é a Aula 18-3 do nivelamento: o modelo não inventa metodologia,
 * aplica aquela. Vai resumida porque o teto de latência é de 2 s e prompt
 * longo custa tempo de geração.
 */
const METODOLOGIA = [
  "Você é especialista em levantamento de requisitos e ajuda a escrever um chamado de suporte, em português do Brasil.",
  "Aplique ESTA metodologia (Aula 18-3), sem inventar outra:",
  "- Problema ≠ requisito ≠ solução. Requisito descreve comportamento; sugestão de solução vem separada e marcada, e o requisito continua de pé sem ela.",
  '- Forma canônica: "o sistema deve …", voz ativa, positivo, um comportamento por requisito.',
  "- Todo requisito precisa ser necessário, único, não ambíguo, completo, consistente, verificável, viável e rastreável (fonte da regra).",
  "- Sempre um exemplo numérico mostrando a conta, com arredondamento, zero e vazio definidos.",
  "- Critérios de aceite em DADO / QUANDO / ENTÃO: o DADO tem entrada, o QUANDO tem uma ação só, o ENTÃO tem valor verificável, e há pelo menos um cenário de exceção.",
  "- Checklist de aceitação em 8 blocos: Identificação, Contexto, Reprodução, Requisito, Números, Critérios de aceite, Escopo, Prioridade.",
  "",
  CAMPOS_ESTRUTURADOS,
  "",
  "Regras da sugestão:",
  "- NUNCA reescreva o que já foi digitado: a sugestão CONTINUA o texto a partir do cursor.",
  "- Se não houver nada de útil a dizer, devolva sugestão vazia. Calar é melhor que atrapalhar quem digita.",
  "- Em `faltando`, liste itens do checklist que o chamado ainda não atende, cada um com o bloco a que pertence.",
  "",
  'Responda SOMENTE com JSON, nesta forma: {"sugestao": "texto", "faltando": [{"bloco": "Números", "item": "Falta um exemplo numérico com a conta."}]}',
].join("\n");

export function instrucaoDoSistema(): string {
  return METODOLOGIA;
}

/**
 * O chamado em texto corrido — a parte que os dois pedidos compartilham.
 *
 * Tipo, entidade, prioridade e prazo são campos estruturados da modal. Eles vêm
 * como linha própria justamente para o modelo NÃO os cobrar do texto: no
 * formato nativo quem sabe disso é o serviço, aqui é o prompt que precisa dizer.
 */
function linhasDoContexto(c: PedidoIa["contexto"]): string[] {
  const linhas = [
    `Tipo do chamado: ${c.tipo ?? "não classificado"}`,
    `Projeto: ${c.projeto ?? "não informado"}`,
    `Entidade: ${c.entidade ?? "não informada"}`,
    `Prioridade: ${c.prioridade ?? "não informada"}`,
    `Prazo: ${c.prazo ?? "não informado"}`,
  ];
  if (c.titulo) linhas.push(`Título do chamado: ${c.titulo}`);
  if (c.descricao) linhas.push(`Descrição do chamado: ${c.descricao}`);
  if (c.comentarios.length) linhas.push(`Comentários recentes:\n- ${c.comentarios.join("\n- ")}`);
  if (c.anexos.length) {
    const anexos = c.anexos.map((a) => `${a.nome}${a.texto_extraido ? `: ${a.texto_extraido}` : ""}`);
    linhas.push(`Anexos (texto extraído):\n- ${anexos.join("\n- ")}`);
  }
  return linhas;
}

/** O chamado e o ponto em que a pessoa parou de digitar, em texto corrido. */
export function instrucaoDoUsuario(pedido: PedidoIa): string {
  const linhas = [`Campo em edição: ${pedido.campo}`, ...linhasDoContexto(pedido.contexto)];

  const antes = pedido.texto_atual.slice(0, pedido.cursor);
  const depois = pedido.texto_atual.slice(pedido.cursor);
  linhas.push("", `Texto já digitado até o cursor:\n${antes || "(vazio)"}`);
  if (depois) linhas.push(`Texto que vem depois do cursor:\n${depois}`);
  linhas.push("", "Continue o texto a partir do cursor.");

  return linhas.join("\n");
}

/**
 * Recorta o primeiro objeto JSON do texto. Modelos genéricos costumam embrulhar
 * a resposta em cerca de código ou em prosa, mesmo mandados calar.
 */
function recortarJson(texto: string): string | null {
  const inicio = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (inicio === -1 || fim <= inicio) return null;
  return texto.slice(inicio, fim + 1);
}

function listaDeFaltando(bruto: unknown): ItemFaltando[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .filter((i): i is Record<string, unknown> => Boolean(i) && typeof i === "object")
    .map((i) => ({bloco: String(i.bloco ?? ""), item: String(i.item ?? "")}))
    .filter((i) => i.bloco || i.item);
}

/**
 * Normaliza a resposta NATIVA (formato `aviao`). Nada do que vem de fora é
 * confiável: o que não tiver a forma esperada é descartado em silêncio, porque
 * devolver lixo ao editor é pior do que não sugerir nada.
 */
export function sanitizarRespostaNativa(bruto: unknown): RespostaIa {
  if (!bruto || typeof bruto !== "object") return RESPOSTA_VAZIA;
  const r = bruto as Record<string, unknown>;
  const confianca = Number(r.confianca);
  return {
    sugestao: typeof r.sugestao === "string" ? r.sugestao : "",
    faltando: listaDeFaltando(r.faltando),
    confianca: Number.isFinite(confianca) ? confianca : 0,
  };
}

/**
 * Lê a resposta de um provedor GENÉRICO, que devolve texto livre e não
 * `faltando` pronto. Se o modelo não colaborar com o JSON pedido, a sugestão
 * sai em branco: sugestão em branco vale mais que sugestão errada.
 */
export function interpretarTextoDoModelo(texto: unknown): RespostaIa {
  if (typeof texto !== "string" || !texto.trim()) return RESPOSTA_VAZIA;
  const json = recortarJson(texto);
  if (!json) return RESPOSTA_VAZIA;
  try {
    return sanitizarRespostaNativa(JSON.parse(json));
  } catch {
    console.warn("[ia-requisitos] o modelo não devolveu JSON válido; sugestão descartada.");
    return RESPOSTA_VAZIA;
  }
}

// ── Análise no salvar ────────────────────────────────────────────────────────

/** Os 8 blocos do checklist de aceitação, na ordem da Parte 9 da aula. */
export const BLOCOS_DO_CHECKLIST = [
  "Identificação",
  "Contexto",
  "Reprodução",
  "Requisito",
  "Números",
  "Critérios de aceite",
  "Escopo",
  "Prioridade",
] as const;

/**
 * A régua da análise. Mais longa que a da sugestão porque aqui não há teto de
 * digitação a respeitar: a análise roda uma vez, ao salvar, e quem espera já
 * está vendo o botão carregando.
 */
const METODOLOGIA_DE_ANALISE = [
  "Você é especialista em levantamento de requisitos e revisa um chamado de suporte, em português do Brasil.",
  "Aplique ESTA metodologia (Aula 18-3), sem inventar outra.",
  "",
  "Checklist de aceitação, na ordem — qualquer item não atendido é levantamento que falta:",
  "1. Identificação: título com módulo, o que acontece e em que situação; classificado como correção ou melhoria; a classificação se sustenta; um problema só; não é duplicata.",
  "2. Contexto: ambiente, entidade, versão, módulo e caminho da tela, perfil do usuário.",
  "3. Reprodução (correções): problema reproduzido e não só relatado; passo a passo numerado, uma ação por linha, com os dados usados; se acontece sempre ou às vezes; desde quando; evidência (print, texto do erro, data e hora).",
  '4. Requisito: descreve o comportamento esperado, na forma "o sistema deve …"; sugestão de solução separada e marcada, com o requisito de pé sem ela; três pessoas entenderiam a mesma coisa; nada que só foi dito em reunião; não contradiz outra regra; a fonte da regra está informada.',
  "5. Números: pelo menos um exemplo numérico; o exemplo mostra a conta, não só o resultado; arredondamento definido quando há divisão; o que acontece com zero e com vazio.",
  "6. Critérios de aceite: escritos em DADO / QUANDO / ENTÃO; o DADO tem os dados de entrada; o QUANDO tem uma ação só; o ENTÃO tem valor verificável; pelo menos um cenário de exceção; duas pessoas chegariam à mesma conclusão sobre passou ou não.",
  "7. Escopo (melhorias): a dor escrita, não só o pedido; como a pessoa resolve isso hoje; o que entra e o que NÃO entra no escopo; impacto nos dados existentes; quem valida a entrega.",
  "8. Prioridade: quantos clientes e usuários são afetados; se trava a operação; se existe contorno; se há prazo legal ou comercial.",
  "",
  CAMPOS_ESTRUTURADOS,
  "Prioridade preenchida no campo atende o bloco 8; entidade preenchida atende a parte de entidade do bloco 2.",
  "",
  "Cinco porquês: quando a causa raiz não estiver clara, encadeie até cinco perguntas partindo do sintoma relatado, cada uma questionando a resposta anterior, para chegar ao comportamento real. Quando a causa já estiver clara, devolva a lista vazia.",
  "",
  "Regras da resposta:",
  "- Um item em `blocos` para CADA um dos 8 blocos, na ordem acima, sempre.",
  "- `percentual` é quanto daquele bloco o chamado atende, de 0 a 100.",
  "- `faltando` traz frases curtas dizendo o que falta naquele bloco; bloco atendido vem com lista vazia.",
  "- `feedback` é curto e direto, dizendo o que melhorar; nada de elogio nem de rodeio.",
  "- `sugestoes` são trechos prontos para colar no chamado, já escritos na forma da metodologia.",
  "- NÃO invente fato que não está no chamado. Se falta informação, o lugar disso é `faltando`, não `sugestoes`.",
  "",
  "Responda SOMENTE com JSON, nesta forma:",
  '{"blocos": [{"bloco": "Identificação", "percentual": 100, "faltando": []}, {"bloco": "Números", "percentual": 0, "faltando": ["Falta um exemplo numérico mostrando a conta."]}],',
  ' "porques": ["Por que o total sai errado? …"], "feedback": "texto curto", "sugestoes": ["trecho pronto para colar"]}',
].join("\n");

export function instrucaoDeAnaliseSistema(): string {
  return METODOLOGIA_DE_ANALISE;
}

/** O chamado inteiro, do jeito que ele será salvo. */
export function instrucaoDeAnaliseUsuario(pedido: PedidoAnalise): string {
  const linhas = [
    pedido.campo === "chamado" ? "Analise o chamado abaixo." : "Analise o comentário abaixo, no contexto do chamado.",
    ...linhasDoContexto(pedido.contexto),
  ];
  if (pedido.titulo) linhas.push("", `Título a salvar:\n${pedido.titulo}`);
  if (pedido.descricao) linhas.push("", `Descrição a salvar:\n${pedido.descricao}`);
  if (pedido.comentario) linhas.push("", `Comentário a salvar:\n${pedido.comentario}`);
  return linhas.join("\n");
}

/**
 * Nota de 0 a 100, ou `null` quando não há nota.
 *
 * O tipo é conferido antes da conversão de propósito: `Number(null)` e
 * `Number("")` valem 0, e um serviço que diz "não tenho nota" com `null` viraria
 * zero — que na tela, no modo `exigir`, é a diferença entre não bloquear e
 * bloquear.
 */
function inteiroDeZeroACem(valor: unknown): number | null {
  if (typeof valor !== "number" && typeof valor !== "string") return null;
  if (valor === "") return null;
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(Math.round(n), 0), 100);
}

function listaDeTexto(bruto: unknown, limite: number): string[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .filter((i) => typeof i === "string")
    .map((i) => (i as string).trim())
    .filter(Boolean)
    .slice(0, limite);
}

/**
 * Blocos do checklist. O modelo pode esquecer o `percentual`; nesse caso o bloco
 * vale pelo que ele mesmo disse que falta — lista vazia é bloco atendido.
 */
function listaDeBlocos(bruto: unknown): BlocoDaAnalise[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .filter((b): b is Record<string, unknown> => Boolean(b) && typeof b === "object")
    .map((b) => {
      const faltando = listaDeTexto(b.faltando, 12);
      return {
        bloco: String(b.bloco ?? "").trim(),
        percentual: inteiroDeZeroACem(b.percentual) ?? (faltando.length ? 0 : 100),
        faltando,
      };
    })
    .filter((b) => b.bloco)
    .slice(0, BLOCOS_DO_CHECKLIST.length);
}

/** Média simples dos blocos — a nota não pode contradizer o que está na tela. */
function aceitacaoDosBlocos(blocos: BlocoDaAnalise[]): number | null {
  if (!blocos.length) return null;
  return Math.round(blocos.reduce((soma, b) => soma + b.percentual, 0) / blocos.length);
}

/**
 * Normaliza a análise NATIVA (formato `aviao`). A nota vem do checklist
 * determinístico do serviço (`checklist.py`) — nota precisa ser reproduzível,
 * então ela é respeitada como veio; só a forma é conferida aqui.
 *
 * Resposta sem nada aproveitável vira análise vazia: mostrar medidor zerado
 * porque o modelo devolveu lixo é pior do que não mostrar medidor nenhum.
 */
export function sanitizarAnaliseNativa(bruto: unknown): RespostaAnalise {
  if (!bruto || typeof bruto !== "object") return ANALISE_VAZIA;
  const r = bruto as Record<string, unknown>;

  const blocos = listaDeBlocos(r.blocos);
  const aceitacao = inteiroDeZeroACem(r.aceitacao) ?? aceitacaoDosBlocos(blocos);
  const analise: RespostaAnalise = {
    aceitacao,
    blocos,
    porques: listaDeTexto(r.porques, 5),
    feedback: typeof r.feedback === "string" ? r.feedback.trim() : "",
    sugestoes: listaDeTexto(r.sugestoes, 5),
  };

  const nadaAproveitavel =
    analise.aceitacao === null &&
    !analise.blocos.length &&
    !analise.porques.length &&
    !analise.feedback &&
    !analise.sugestoes.length;
  return nadaAproveitavel ? ANALISE_VAZIA : analise;
}

/**
 * Lê a análise de um provedor GENÉRICO, que devolve texto livre.
 *
 * Aqui a nota **não** é pedida ao modelo: ela sai da média dos blocos que ele
 * mesmo devolveu, para o número bater com o que a tela lista. Se o modelo não
 * colaborar com o JSON pedido, a análise sai vazia — análise vazia vale mais
 * que análise inventada.
 */
export function interpretarAnaliseDoModelo(texto: unknown): RespostaAnalise {
  if (typeof texto !== "string" || !texto.trim()) return ANALISE_VAZIA;
  const json = recortarJson(texto);
  if (!json) return ANALISE_VAZIA;
  try {
    const bruto = JSON.parse(json) as Record<string, unknown>;
    return sanitizarAnaliseNativa({...bruto, aceitacao: undefined});
  } catch {
    console.warn("[ia-requisitos] o modelo não devolveu JSON válido; análise descartada.");
    return ANALISE_VAZIA;
  }
}

// ── Melhorar o texto ─────────────────────────────────────────────────────────

/**
 * A régua da melhoria, para os formatos genéricos.
 *
 * Reescrever não é escrever no lugar de alguém: o texto sai mais claro e na
 * forma da metodologia, mas nada que o chamado não diga entra nele. O que falta
 * continua faltando — quem aponta a falta é a análise, não a melhoria.
 */
const METODOLOGIA_DE_MELHORIA = [
  "Você reescreve o texto de um chamado de suporte, em português do Brasil, aplicando a metodologia de levantamento de requisitos da Aula 18-3 — sem inventar outra.",
  "",
  "O que fazer:",
  "- Corrija ortografia, concordância, acentuação e pontuação.",
  '- Organize o texto na forma da metodologia: o problema, o comportamento esperado ("o sistema deve …", voz ativa, um comportamento por frase), o exemplo numérico mostrando a conta e os critérios de aceite em DADO / QUANDO / ENTÃO.',
  "- Mantenha TODAS as informações técnicas do original — telas, caminhos, versões, mensagens de erro, números, códigos e passos — exatamente como estão.",
  "- Separe e marque a sugestão de solução, quando houver: o requisito continua de pé sem ela.",
  "- Use listas quando o texto tiver passos ou itens.",
  "",
  "O que NÃO fazer:",
  "- NÃO invente fato que não esteja no texto nem no contexto: nome de tela, número, causa, prazo, responsável. O que falta continua faltando.",
  "- NÃO responda com prefácio, saudação, comentário nem explicação do que você fez.",
  "- NÃO devolva Markdown.",
  "",
  'Responda SOMENTE com JSON, nesta forma: {"texto": "<p>o texto melhorado, em HTML</p>"}',
  "O HTML aceita <p>, <strong>, <em>, <ul>/<ol>/<li> e <br>.",
].join("\n");

export function instrucaoDeMelhoriaSistema(): string {
  return METODOLOGIA_DE_MELHORIA;
}

/** O texto a reescrever, com o chamado em volta dele. */
export function instrucaoDeMelhoriaUsuario(pedido: PedidoMelhoria): string {
  const linhas = [
    pedido.campo === "descricao"
      ? "Reescreva a descrição abaixo."
      : "Reescreva o comentário abaixo, no contexto do chamado.",
    ...linhasDoContexto(pedido.contexto),
    "",
    `Texto a melhorar:\n${pedido.texto}`,
  ];
  return linhas.join("\n");
}

/** Modelo que embrulha a resposta em cerca de código, mesmo mandado calar. */
function semCercaDeCodigo(texto: string): string {
  return texto
    .trim()
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/```$/, "")
    .trim();
}

/** Trechos curtos que a guarda apontou; o resto da lista é descartado em silêncio. */
const LIMITE_DE_AVISOS = 20;
const LIMITE_DO_TRECHO = 200;

/**
 * As suspeitas da guarda, como vieram. Elas nunca mudam o que é entregue —
 * viajam ao lado da proposta para quem decide decidir com informação.
 */
function avisosDe(bruto: unknown): AvisosDaMelhoria {
  if (!bruto || typeof bruto !== "object") return semAvisos();
  const r = bruto as Record<string, unknown>;
  const trechos = (valor: unknown) => listaDeTexto(valor, LIMITE_DE_AVISOS).map((t) => t.slice(0, LIMITE_DO_TRECHO));
  return {perdidos: trechos(r.perdidos), inventados: trechos(r.inventados)};
}

/**
 * A nota antes → depois. Sem nenhum dos dois números não há medidor a desenhar,
 * e `null` diz isso melhor do que um par de zeros — zero é nota, ausência não é.
 */
function aceitacaoDe(bruto: unknown): AceitacaoDaMelhoria | null {
  if (!bruto || typeof bruto !== "object") return null;
  const r = bruto as Record<string, unknown>;
  const antes = inteiroDeZeroACem(r.antes);
  const depois = inteiroDeZeroACem(r.depois);
  return antes === null && depois === null ? null : {antes, depois};
}

/** Texto vazio é melhoria que não houve; o resto compara com o original. */
function melhoriaDe(texto: string, original: string): RespostaMelhoria {
  const limpo = texto.trim();
  if (!limpo) return MELHORIA_VAZIA;
  return {texto: limpo, mudou: limpo !== original.trim(), avisos: semAvisos(), aceitacao: null};
}

/**
 * Normaliza a melhoria NATIVA (formato `aviao`). O serviço diz se mexeu no
 * texto; quando não diz, a comparação com o original responde por ele.
 *
 * Avisos e nota vêm junto porque só o serviço nativo sabe produzi-los: a guarda
 * e o checklist determinístico moram nele. Vindo qualquer coisa fora da forma,
 * o que se perde é o aviso — nunca a proposta.
 */
export function sanitizarMelhoriaNativa(bruto: unknown, original: string): RespostaMelhoria {
  if (!bruto || typeof bruto !== "object") return MELHORIA_VAZIA;
  const r = bruto as Record<string, unknown>;
  const melhoria = melhoriaDe(typeof r.texto === "string" ? r.texto : "", original);
  if (!melhoria.texto) return melhoria;
  return {
    ...melhoria,
    mudou: typeof r.mudou === "boolean" ? r.mudou : melhoria.mudou,
    avisos: avisosDe(r.avisos),
    aceitacao: aceitacaoDe(r.aceitacao),
  };
}

/**
 * Lê a melhoria de um provedor GENÉRICO.
 *
 * Diferente da sugestão e da análise, aqui a resposta INTEIRA é o produto: um
 * modelo que ignorou o JSON e mandou o HTML direto ainda entregou o que se
 * pediu, e descartar isso seria jogar fora a única coisa que o usuário queria.
 * Por isso o JSON é a primeira tentativa, não a única.
 *
 * Avisos e nota saem daqui sempre vazios, mesmo que o modelo os tenha escrito —
 * pela mesma razão que a análise genérica descarta a nota do modelo: guarda e
 * checklist são contas, não opinião, e número inventado ao lado do texto engana
 * mais do que ajuda. Ausente, a tela mostra só o diff.
 */
export function interpretarMelhoriaDoModelo(bruto: unknown, original: string): RespostaMelhoria {
  if (typeof bruto !== "string" || !bruto.trim()) return MELHORIA_VAZIA;

  const json = recortarJson(bruto);
  if (json) {
    try {
      const lido = JSON.parse(json) as Record<string, unknown>;
      if (typeof lido.texto === "string") {
        return sanitizarMelhoriaNativa({texto: lido.texto, mudou: lido.mudou}, original);
      }
    } catch {
      // Não era JSON: o texto cru ainda pode ser o HTML pedido.
    }
  }
  return melhoriaDe(semCercaDeCodigo(bruto), original);
}
