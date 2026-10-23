/**
 * Cliente HTTP do serviço "IA da Quality" (repositório InteligenciaArtificial):
 * a busca na wiki da Quality (Wiki.js), o conteúdo de uma página e a pergunta
 * à IA, que responde com a base de conhecimento dessa wiki.
 *
 * O serviço não pede autenticação (o SIART chama direto do navegador). Aqui ele
 * é chamado pelo servidor para que o texto do cliente saia por um caminho só,
 * registrado na trilha LGPD.
 *
 * Nenhuma função lança: serviço fora do ar, resposta fora da forma ou tempo
 * estourado viram `null`, e quem chama devolve lista vazia ou sugestão nula.
 * Abrir solicitação não pode depender da IA estar de pé.
 *
 * A configuração é lida a cada chamada, como a da IA de requisitos: trocar o
 * endereço vale sem rebuild.
 */

export type ConfigDaIaDaQuality = {
  /** Endereço base do serviço, sem barra final. */
  urlDaIa: string;
  /** Endereço público da wiki, onde a pessoa abre a página. */
  urlDaWiki: string;
  /** Teto da busca e da leitura de página: chamadas que rodam enquanto a pessoa digita. */
  tempoLimiteMs: number;
  /**
   * Teto da resposta da IA. É outra espera: a pessoa clicou em "Sugerir
   * solução" e o modelo escreve a resposta inteira antes de devolver.
   */
  tempoLimiteDaRespostaMs: number;
};

const URL_DA_IA_PADRAO = "https://ia.qualitysistemas.inf.br";
const URL_DA_WIKI_PADRAO = "https://wiki.qualitysistemas.inf.br";
const TEMPO_LIMITE_PADRAO_MS = 6000;
const TEMPO_LIMITE_DA_RESPOSTA_PADRAO_MS = 30000;

type Ambiente = Record<string, string | undefined>;

const readUrl = (valor: string | undefined, padrao: string) => (valor ?? "").trim().replace(/\/+$/, "") || padrao;

const readMs = (valor: string | undefined, padrao: number) => {
  const n = Number((valor ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : padrao;
};

export const readConfigDaIaDaQuality = (env: Ambiente = process.env): ConfigDaIaDaQuality => ({
  urlDaIa: readUrl(env.IA_DA_QUALITY_URL, URL_DA_IA_PADRAO),
  urlDaWiki: readUrl(env.WIKI_DA_QUALITY_URL, URL_DA_WIKI_PADRAO),
  tempoLimiteMs: readMs(env.IA_DA_QUALITY_TIMEOUT_MS, TEMPO_LIMITE_PADRAO_MS),
  tempoLimiteDaRespostaMs: readMs(env.IA_DA_QUALITY_RESPOSTA_TIMEOUT_MS, TEMPO_LIMITE_DA_RESPOSTA_PADRAO_MS),
});

/** O host do serviço, para a trilha de auditoria (sem caminho nem consulta). */
export const readDestino = (config: ConfigDaIaDaQuality) => config.urlDaIa.replace(/^[a-z]+:\/\//i, "").split("/")[0];

/** Faz a chamada e devolve o JSON; qualquer falha vira `null`, com aviso no log. */
async function fetchJson(url: string, init: RequestInit, tempoLimiteMs: number): Promise<unknown> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(tempoLimiteMs) });
    if (res.ok) return await res.json();
    console.warn(`[wiki-sugestoes] IA da Quality respondeu ${res.status} em ${new URL(url).pathname}.`);
    return null;
  } catch (e: any) {
    console.warn(`[wiki-sugestoes] IA da Quality não respondeu em ${new URL(url).pathname}:`, e?.message ?? e);
    return null;
  }
}

/** `GET /api/wiki/search?q=`: o corpo cru, para as regras lerem. */
export const searchWiki = (config: ConfigDaIaDaQuality, consulta: string) =>
  fetchJson(`${config.urlDaIa}/api/wiki/search?q=${encodeURIComponent(consulta)}`, {}, config.tempoLimiteMs);

/** `GET /api/wiki/document/:id`: o documento, ou `null`. */
export const findDocumentoDaWiki = async (
  config: ConfigDaIaDaQuality,
  id: string
): Promise<{ title: string; content: string } | null> => {
  const corpo = (await fetchJson(
    `${config.urlDaIa}/api/wiki/document/${encodeURIComponent(id)}`,
    {},
    config.tempoLimiteMs
  )) as { document?: { title?: unknown; content?: unknown } } | null;
  const documento = corpo?.document;
  if (!documento) return null;
  return {
    title: typeof documento.title === "string" ? documento.title : "",
    content: typeof documento.content === "string" ? documento.content : "",
  };
};

/** `POST /api/ai/query {question}`: o corpo cru da resposta da IA, para as regras lerem. */
export const askIaDaQuality = (config: ConfigDaIaDaQuality, question: string) =>
  fetchJson(
    `${config.urlDaIa}/api/ai/query`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) },
    config.tempoLimiteDaRespostaMs
  );
