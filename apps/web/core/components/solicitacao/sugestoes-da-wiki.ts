/**
 * Regras do bloco "Na wiki" do modal de solicitação, sem React: o texto que
 * vai para a busca e quando vale buscar. A busca em si (palavras vazias,
 * ranqueamento) é do servidor: `GET /workspaces/:slug/wiki/sugestoes/`.
 */

/** Espera depois da última tecla antes de buscar. */
export const ATRASO_DA_BUSCA_NA_WIKI_MS = 600;

/** Com menos palavras que isto, o relato ainda não diz do que se trata. */
export const MINIMO_DE_PALAVRAS_DA_WIKI = 3;

export type TSugestaoDaWiki = {
  id: string;
  name: string;
  project_id: string | null;
  trecho: string;
  url: string;
};

export type TSugestaoDeSolucao = { sugestao: string } | { sugestao: null; motivo: string };

const ENTIDADES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

const withoutEspacoRepetido = (texto: string) => texto.replace(/\s+/g, " ").trim();

/** O texto do editor rico, sem marcas: cada bloco vira uma palavra separada da outra. */
export const extractTextoDoHtml = (html: string): string =>
  withoutEspacoRepetido(
    html.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, (entidade) => ENTIDADES[entidade])
  );

/** O que vai para a busca: o título e o complemento, em texto puro. */
export const buildTextoDaBuscaNaWiki = (titulo: string, complementoHtml: string): string =>
  withoutEspacoRepetido(`${titulo} ${extractTextoDoHtml(complementoHtml)}`);

/** Busca quando o relato já tem palavras suficientes para dizer o assunto. */
export const isHoraDeBuscarNaWiki = (texto: string): boolean =>
  (texto.match(/[\p{L}\p{N}]+/gu) ?? []).length >= MINIMO_DE_PALAVRAS_DA_WIKI;

/** A sugestão da IA, ou o motivo de não haver uma. */
export const readMensagemDaSugestao = (resposta: TSugestaoDeSolucao): string =>
  "motivo" in resposta ? resposta.motivo : resposta.sugestao;
