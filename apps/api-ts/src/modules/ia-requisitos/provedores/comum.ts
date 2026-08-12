/**
 * O que todo provedor compartilha: a ida à rede que não lança, a instrução com
 * a metodologia e a leitura da resposta.
 *
 * Só o provedor nativo (`aviao`) recebe a metodologia embutida no modelo. Os
 * demais formatos são LLMs genéricos: para eles a régua da Aula 18-3 viaja no
 * prompt, e a resposta em JSON é extraída aqui.
 */

import {RESPOSTA_VAZIA, type ItemFaltando, type PedidoIa, type RespostaIa} from "@modules/ia-requisitos/tipos";

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

/** O chamado e o ponto em que a pessoa parou de digitar, em texto corrido. */
export function instrucaoDoUsuario(pedido: PedidoIa): string {
  const c = pedido.contexto;
  const linhas = [
    `Campo em edição: ${pedido.campo}`,
    `Tipo do chamado: ${c.tipo ?? "não classificado"}`,
    `Projeto: ${c.projeto ?? "não informado"}`,
    `Entidade: ${c.entidade ?? "não informada"}`,
  ];
  if (c.titulo) linhas.push(`Título do chamado: ${c.titulo}`);
  if (c.descricao) linhas.push(`Descrição do chamado: ${c.descricao}`);
  if (c.comentarios.length) linhas.push(`Comentários recentes:\n- ${c.comentarios.join("\n- ")}`);
  if (c.anexos.length) {
    const anexos = c.anexos.map((a) => `${a.nome}${a.texto_extraido ? `: ${a.texto_extraido}` : ""}`);
    linhas.push(`Anexos (texto extraído):\n- ${anexos.join("\n- ")}`);
  }

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
