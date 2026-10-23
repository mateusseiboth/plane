/**
 * Regras puras das sugestões da wiki ao abrir solicitação: o texto livre do
 * problema vira consulta, cada página achada ganha o endereço da tela, e a
 * sugestão da IA é cortada no tamanho de um aviso. Sem banco, sem rede.
 */
import { isUuid } from "@modules/pos-atendimento/pos-atendimento.rules";

/** Termos que vão para a consulta. Texto de atendimento é longo; o começo diz o assunto. */
export const LIMITE_DE_TERMOS_DA_WIKI = 8;

/** Páginas devolvidas, e também o teto das que viajam para a IA como contexto. */
export const LIMITE_DE_PAGINAS_DA_WIKI = 5;

/** Teto da sugestão mostrada no modal: um parágrafo curto, não um manual. */
export const LIMITE_DA_SUGESTAO = 600;

/** Teto do problema que sai para a IA; o corpo vem do navegador. */
export const LIMITE_DO_TEXTO_DO_PROBLEMA = 4000;

/** Palavras com menos letras que isto não ajudam a achar página (de, o, a, 12). */
const TAMANHO_MINIMO_DO_TERMO = 3;

/**
 * Palavras que aparecem em quase todo relato e não distinguem uma página da
 * outra. Escritas sem acento: a comparação é feita no texto já sem acento.
 * Além das palavras vazias do português, entram as muletas do atendimento
 * ("o cliente não consegue…") e os operadores que a pessoa possa digitar.
 */
const PALAVRAS_VAZIAS = new Set([
  "que",
  "para",
  "com",
  "nao",
  "uma",
  "umas",
  "uns",
  "por",
  "mais",
  "mas",
  "como",
  "foi",
  "ele",
  "ela",
  "eles",
  "elas",
  "isso",
  "isto",
  "esse",
  "essa",
  "esses",
  "essas",
  "este",
  "esta",
  "estes",
  "estas",
  "aquele",
  "aquela",
  "seu",
  "sua",
  "seus",
  "suas",
  "meu",
  "minha",
  "nos",
  "nas",
  "dos",
  "das",
  "aos",
  "pelo",
  "pela",
  "pelos",
  "pelas",
  "num",
  "numa",
  "sem",
  "sob",
  "sobre",
  "entre",
  "ate",
  "apos",
  "quando",
  "onde",
  "qual",
  "quais",
  "quem",
  "porque",
  "pois",
  "entao",
  "tambem",
  "ainda",
  "muito",
  "pouco",
  "todo",
  "toda",
  "todos",
  "todas",
  "cada",
  "outro",
  "outra",
  "mesmo",
  "mesma",
  "ter",
  "tem",
  "tinha",
  "teve",
  "ser",
  "sao",
  "era",
  "estar",
  "estao",
  "estava",
  "fica",
  "ficou",
  "fazer",
  "faz",
  "fez",
  "pode",
  "podem",
  "poder",
  "nem",
  "sim",
  "aqui",
  "ali",
  "lhe",
  "lhes",
  "voce",
  "voces",
  "nosso",
  "nossa",
  "dele",
  "dela",
  "deles",
  "delas",
  "depois",
  "antes",
  "agora",
  "hoje",
  "ontem",
  "consegue",
  "conseguem",
  "conseguindo",
  "consigo",
  "cliente",
  "clientes",
  "usuario",
  "usuaria",
  "favor",
  "bom",
  "boa",
  "dia",
  "tarde",
  "noite",
  "ola",
  "obrigado",
  "obrigada",
  "gostaria",
  "preciso",
  "precisa",
  "problema",
  "sistema",
  "and",
  "not",
]);

const withoutAcento = (texto: string) => texto.normalize("NFD").replace(/\p{M}/gu, "");

const isTermoUtil = (termo: string) => termo.length >= TAMANHO_MINIMO_DO_TERMO && !PALAVRAS_VAZIAS.has(termo);

/** Os termos do texto, sem acento, sem repetição, na ordem em que foram escritos. */
export const extractTermosDaWiki = (texto: string): string[] => {
  const termos = withoutAcento(texto.toLowerCase())
    .split(/[^\p{L}\p{N}]+/u)
    .filter(isTermoUtil);
  return [...new Set(termos)].slice(0, LIMITE_DE_TERMOS_DA_WIKI);
};

/**
 * A consulta no formato do `websearch_to_tsquery`: os termos ligados por OU.
 * Com E, um relato de três frases não acharia página nenhuma; com OU, quem
 * casa mais termos sobe no `ts_rank`. Os termos só têm letras e números, então
 * nada do que a pessoa digitou vira operador.
 */
export const buildConsultaDaWiki = (texto: string): string => extractTermosDaWiki(texto).join(" or ");

/**
 * Endereço de uma página na tela: a de sistema abre no sistema (o escolhido no
 * modal, quando ela está nele); a sem sistema é da wiki. Mesma regra do
 * `getPaginaPath` de `@plane/utils`.
 */
export const buildEnderecoDaPagina = (args: {
  slug: string;
  pageId: string;
  projectIds: string[];
  projectIdPreferido: string | null;
}): { project_id: string | null; url: string } => {
  const { slug, pageId, projectIds, projectIdPreferido } = args;
  const sistema = projectIds.find((id) => id === projectIdPreferido) ?? projectIds[0] ?? null;
  if (!sistema) return { project_id: null, url: `/${slug}/wiki/${pageId}` };
  return { project_id: sistema, url: `/${slug}/projects/${sistema}/pages/${pageId}` };
};

/** Corta no fim de uma palavra, com reticências, para caber no aviso do modal. */
export const limitSugestao = (texto: string): string => {
  const limpo = texto.trim();
  if (limpo.length <= LIMITE_DA_SUGESTAO) return limpo;
  const recorte = limpo.slice(0, LIMITE_DA_SUGESTAO - 1);
  const fimDaPalavra = recorte.lastIndexOf(" ");
  return `${(fimDaPalavra > 0 ? recorte.slice(0, fimDaPalavra) : recorte).trimEnd()}…`;
};

export type PedidoDeResolucao = { texto: string; paginaIds: string[] };

const readTexto = (valor: unknown) => (typeof valor === "string" ? valor.trim() : "");

/** Só ids de verdade: o que não é uuid quebraria o `::uuid[]` da consulta. */
const readPaginaIds = (valor: unknown): string[] => {
  if (!Array.isArray(valor)) return [];
  return [...new Set(valor.filter(isUuid))].slice(0, LIMITE_DE_PAGINAS_DA_WIKI);
};

/** O corpo de `POST .../wiki/sugestoes/resolver/`, conferido campo a campo. */
export const readPedidoDeResolucao = (corpo: unknown): PedidoDeResolucao => {
  const bruto = (corpo ?? {}) as { texto?: unknown; paginas?: unknown };
  return {
    texto: readTexto(bruto.texto).slice(0, LIMITE_DO_TEXTO_DO_PROBLEMA),
    paginaIds: readPaginaIds(bruto.paginas),
  };
};

/**
 * Por que não houve sugestão. Texto de tela: a pessoa lê e segue com as
 * páginas que já estão no modal.
 */
export const MOTIVO_DA_SUGESTAO = {
  semTexto: "Descreva o problema para receber uma sugestão.",
  semPaginas: "Nada parecido na wiki.",
  semIa: "Sugestão automática indisponível. Consulte as páginas da wiki.",
  falhou: "Não foi possível sugerir agora. Consulte as páginas da wiki.",
} as const;
