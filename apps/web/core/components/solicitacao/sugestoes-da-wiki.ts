/**
 * Regras do bloco "Na wiki" do modal de solicitação, sem React: o texto que
 * vai para a busca, quando vale buscar e o que mostrar da resposta da IA. A
 * busca em si é na wiki da Quality, pelo servidor:
 * `GET /workspaces/:slug/wiki/sugestoes/`.
 */

/** Espera depois da última tecla antes de buscar. */
export const ATRASO_DA_BUSCA_NA_WIKI_MS = 600;

/** Com menos palavras que isto, o relato ainda não diz do que se trata. */
export const MINIMO_DE_PALAVRAS_DA_WIKI = 3;

/** Uma página da wiki da Quality: `url` é o endereço público dela, `sistema` o primeiro pedaço do caminho. */
export type TSugestaoDaWiki = {
  id: string;
  name: string;
  trecho: string;
  url: string;
  sistema: string;
};

export type TPaginaConsultada = { name: string; url: string };

export type TSugestaoDeSolucao =
  | { sugestao: string; paginas_consultadas: TPaginaConsultada[] }
  | { sugestao: null; motivo: string };

/** Sem resposta da IA da Quality (fora do ar, erro de rede). */
export const MENSAGEM_SEM_IA = "A IA da Quality não respondeu agora.";

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

/** A sugestão da IA, o motivo de não haver uma, ou o aviso de que ela não respondeu. */
export const readMensagemDaSugestao = (resposta: TSugestaoDeSolucao | undefined): string =>
  resposta?.sugestao ?? (resposta && "motivo" in resposta ? resposta.motivo : MENSAGEM_SEM_IA);

/** As páginas da wiki que a IA usou para responder. */
export const readFontesDaSugestao = (resposta: TSugestaoDeSolucao | undefined): TPaginaConsultada[] =>
  resposta && "paginas_consultadas" in resposta ? resposta.paginas_consultadas : [];
