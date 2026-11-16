/**
 * Regras puras das sugestões da wiki da Quality ao abrir solicitação: o texto
 * livre do problema vira consulta para a IA da Quality, cada resultado vira
 * sugestão (endereço na wiki, sistema, trecho), as páginas do sistema escolhido
 * sobem, e a resposta da IA é lida e cortada no tamanho de um aviso.
 * Sem banco, sem rede.
 */

/** Termos que vão para a consulta. Texto de atendimento é longo; o começo diz o assunto. */
export const LIMITE_DE_TERMOS_DA_WIKI = 8;

/** Páginas devolvidas, e também o teto das que viajam para a IA como referência. */
export const LIMITE_DE_PAGINAS_DA_WIKI = 5;

/** Teto da sugestão mostrada no modal: um parágrafo curto, não um manual. */
export const LIMITE_DA_SUGESTAO = 600;

/** Teto do trecho de cada página na lista do modal. */
export const LIMITE_DO_TRECHO = 300;

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

/** Chave de comparação: sem acento, sem caixa. */
const buildChaveDoTermo = (termo: string) => withoutAcento(termo.toLowerCase());

const isTermoUtil = (termo: string) =>
  termo.length >= TAMANHO_MINIMO_DO_TERMO && !PALAVRAS_VAZIAS.has(buildChaveDoTermo(termo));

/**
 * Os termos do texto, em minúsculas e COM acento, sem repetição, na ordem em
 * que foram escritos. O acento fica porque a busca da wiki da Quality o
 * distingue ("emissao" não acha "emissão"); a repetição e as palavras vazias
 * são comparadas sem ele.
 */
export const extractTermosDaWiki = (texto: string): string[] => {
  const termos = texto
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(isTermoUtil);
  const chaves = termos.map(buildChaveDoTermo);
  return termos.filter((_, i) => chaves.indexOf(chaves[i]) === i).slice(0, LIMITE_DE_TERMOS_DA_WIKI);
};

/**
 * A consulta para `GET /api/wiki/search`: os termos ligados por OU. A busca da
 * wiki da Quality liga palavras soltas por E, e um relato de três frases não
 * acharia página nenhuma. Os termos só têm letras e números, então nada do que
 * a pessoa digitou vira operador.
 */
export const buildConsultaDaWiki = (texto: string): string => extractTermosDaWiki(texto).join(" or ");

// ── Resultado da busca ───────────────────────────────────────────────────────

/** Uma página da wiki da Quality, como a busca da IA da Quality devolve. */
export type PaginaDaIaDaQuality = { id: string; title: string; path: string; tags: string[]; summary: string };

/** O que o modal recebe por página. */
export type SugestaoDaWiki = { id: string; name: string; trecho: string; url: string; sistema: string };

/** O sistema escolhido no modal, para dar prioridade às páginas dele. */
export type SistemaDaBusca = { identifier: string; name: string };

const readTextoSolto = (valor: unknown) => (typeof valor === "string" ? valor.trim() : "");

const readId = (valor: unknown) => (typeof valor === "number" ? String(valor) : readTextoSolto(valor));

const readTags = (valor: unknown): string[] =>
  Array.isArray(valor) ? valor.filter((tag): tag is string => typeof tag === "string" && !!tag.trim()) : [];

const readPagina = (bruto: unknown): PaginaDaIaDaQuality => {
  const pagina = (bruto ?? {}) as Record<string, unknown>;
  return {
    id: readId(pagina.id),
    title: readTextoSolto(pagina.title),
    path: readTextoSolto(pagina.path),
    tags: readTags(pagina.tags),
    summary: readTextoSolto(pagina.summary),
  };
};

const isPaginaCompleta = (pagina: PaginaDaIaDaQuality) => !!(pagina.id && pagina.title && pagina.path);

/** O corpo de `/api/wiki/search`, conferido: o que não é página vira nada. */
export const readPaginasDaBusca = (corpo: unknown): PaginaDaIaDaQuality[] => {
  const resultados = (corpo as { results?: unknown } | null)?.results;
  if (!Array.isArray(resultados)) return [];
  return resultados.map(readPagina).filter(isPaginaCompleta);
};

const withoutBarrasNasPontas = (path: string) => path.replace(/^\/+|\/+$/g, "");

/** Endereço público da página na wiki da Quality. */
export const buildUrlDaWiki = (urlDaWiki: string, path: string): string =>
  `${urlDaWiki}/${withoutBarrasNasPontas(path).split("/").map(encodeURIComponent).join("/")}`;

/**
 * Endereço do documento no informe da Quality: é lá que o atendimento lê a
 * página (pedido de 16/11/2026). O informe abre qualquer documento da wiki
 * pelo id, não pelo caminho.
 */
export const buildUrlDoInforme = (urlDoInforme: string, id: string): string =>
  `${urlDoInforme}/document/${encodeURIComponent(id)}`;

/** O corpo de `/api/wiki/documents`: o id de cada caminho, para achar no informe a página citada pela IA. */
export const readIdsPorCaminho = (corpo: unknown): Map<string, string> => {
  const documentos = (corpo as { documents?: unknown } | null)?.documents;
  if (!Array.isArray(documentos)) return new Map();
  const paginas = documentos.map(readPagina).filter((pagina) => pagina.id && pagina.path);
  return new Map(paginas.map((pagina) => [withoutBarrasNasPontas(pagina.path), pagina.id]));
};

export type EnderecosDaWiki = { urlDoInforme: string; urlDaWiki: string };

/**
 * O endereço de uma página citada só pelo caminho (a IA não devolve o id): no
 * informe quando o id é conhecido; senão na wiki, para o link não quebrar.
 */
export const buildReadUrlDaPagina =
  (enderecos: EnderecosDaWiki, idsPorCaminho: Map<string, string>) =>
  (path: string): string => {
    const id = idsPorCaminho.get(withoutBarrasNasPontas(path));
    return id ? buildUrlDoInforme(enderecos.urlDoInforme, id) : buildUrlDaWiki(enderecos.urlDaWiki, path);
  };

/** O caminho começa pelo sistema: `siart/...`, `Planejar/...`, `web/...`. */
export const readSistemaDoPath = (path: string): string => withoutBarrasNasPontas(path).split("/")[0];

/** Rótulo comparável: sem acento, sem caixa, sublinhado e hífen como espaço. */
const normalizeRotulo = (texto: string) =>
  buildChaveDoTermo(texto)
    .replace(/[\s_-]+/g, " ")
    .trim();

/**
 * A página é do sistema quando um pedaço do caminho (`siart/...`,
 * `web/SIART/...`), ou uma das tags, é o identificador ou o nome dele.
 * Pedaço inteiro: `siartweb` não é `siart`.
 */
export const isPaginaDoSistema = (path: string, tags: string[], sistema: SistemaDaBusca): boolean => {
  const nomesDoSistema = new Set([sistema.identifier, sistema.name].map(normalizeRotulo).filter(Boolean));
  return [...path.split("/"), ...tags].map(normalizeRotulo).some((rotulo) => nomesDoSistema.has(rotulo));
};

/** As páginas do sistema escolhido primeiro; dentro de cada grupo, a ordem da busca. */
export const prioritizePaginasDoSistema = (
  paginas: PaginaDaIaDaQuality[],
  sistema: SistemaDaBusca | null
): PaginaDaIaDaQuality[] => {
  if (!sistema) return paginas;
  const isDoSistema = (pagina: PaginaDaIaDaQuality) => isPaginaDoSistema(pagina.path, pagina.tags, sistema);
  return [...paginas.filter(isDoSistema), ...paginas.filter((pagina) => !isDoSistema(pagina))];
};

/** Corta no fim de uma palavra, com reticências. */
const limitTexto = (texto: string, limite: number): string => {
  const limpo = texto.trim();
  if (limpo.length <= limite) return limpo;
  const recorte = limpo.slice(0, limite - 1);
  const fimDaPalavra = recorte.lastIndexOf(" ");
  return `${(fimDaPalavra > 0 ? recorte.slice(0, fimDaPalavra) : recorte).trimEnd()}…`;
};

const ENTIDADES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

/**
 * O começo do texto da página, em texto puro: sem os títulos (o primeiro
 * repete o nome da página), sem marcas e sem entidades.
 */
export const buildTrechoDoConteudo = (html: string): string =>
  limitTexto(
    html
      .replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, (entidade) => ENTIDADES[entidade])
      .replace(/\s+/g, " "),
    LIMITE_DO_TRECHO
  );

/**
 * Uma página como o modal mostra. O trecho é o resumo da busca; sem ele, o
 * começo do conteúdo; sem conteúdo, as tags.
 */
export const mapSugestaoDaWiki = (
  pagina: PaginaDaIaDaQuality,
  urlDoInforme: string,
  conteudo = ""
): SugestaoDaWiki => ({
  id: pagina.id,
  name: pagina.title,
  trecho: limitTexto(pagina.summary, LIMITE_DO_TRECHO) || buildTrechoDoConteudo(conteudo) || pagina.tags.join(", "),
  url: buildUrlDoInforme(urlDoInforme, pagina.id),
  sistema: readSistemaDoPath(pagina.path),
});

// ── Sugestão de solução ──────────────────────────────────────────────────────

/** Corta a resposta da IA no tamanho do aviso do modal. */
export const limitSugestao = (texto: string): string => limitTexto(texto, LIMITE_DA_SUGESTAO);

export type PedidoDeResolucao = { texto: string; paginaIds: string[] };

/** Id de página da wiki da Quality: número. Nada que mude o caminho da chamada. */
const isIdDaWiki = (id: string) => /^\d{1,12}$/.test(id);

const readPaginaIds = (valor: unknown): string[] => {
  if (!Array.isArray(valor)) return [];
  return [...new Set(valor.map(readId).filter(isIdDaWiki))].slice(0, LIMITE_DE_PAGINAS_DA_WIKI);
};

/** O corpo de `POST .../wiki/sugestoes/resolver/`, conferido campo a campo. */
export const readPedidoDeResolucao = (corpo: unknown): PedidoDeResolucao => {
  const bruto = (corpo ?? {}) as { texto?: unknown; paginas?: unknown };
  return {
    texto: readTextoSolto(bruto.texto).slice(0, LIMITE_DO_TEXTO_DO_PROBLEMA),
    paginaIds: readPaginaIds(bruto.paginas),
  };
};

/**
 * A pergunta para `POST /api/ai/query`. A IA da Quality busca sozinha na base
 * de conhecimento; os títulos das páginas que o modal já achou ajudam essa
 * busca a cair no mesmo assunto.
 */
export const buildPerguntaDeResolucao = (texto: string, titulos: string[]): string =>
  [
    "Sou do atendimento de suporte e o cliente relatou o problema abaixo.",
    "O que devo fazer para resolver? Responda em português, em poucas frases, com o passo a passo da wiki.",
    "",
    `Problema: ${texto}`,
    ...(titulos.length ? ["", `Páginas da wiki que podem ajudar: ${titulos.join("; ")}.`] : []),
  ].join("\n");

export type PaginaConsultada = { name: string; url: string };

export type RespostaDaIa = { sugestao: string; paginas_consultadas: PaginaConsultada[] };

/** As páginas que a IA usou, sem repetir (ela devolve um item por trecho achado). */
const readPaginasConsultadas = (valor: unknown, readUrl: (path: string) => string): PaginaConsultada[] => {
  const paginas = Array.isArray(valor) ? valor.map(readPagina) : [];
  const unicas = new Map(paginas.filter((p) => p.title && p.path).map((p) => [p.path, p]));
  return [...unicas.values()].map((p) => ({ name: p.title, url: readUrl(p.path) }));
};

/**
 * A resposta de `/api/ai/query`, ou `null` quando não há o que mostrar. O
 * serviço devolve o próprio erro com status 200 (`source_info.source = "Error"`
 * e um pedido de desculpas em `response`): isso não é sugestão.
 */
export const readRespostaDaIa = (corpo: unknown, readUrl: (path: string) => string): RespostaDaIa | null => {
  const bruto = (corpo ?? {}) as { response?: unknown; source_info?: { source?: unknown; pages_consulted?: unknown } };
  const sugestao = limitSugestao(readTextoSolto(bruto.response));
  if (!sugestao || bruto.source_info?.source === "Error") return null;
  return { sugestao, paginas_consultadas: readPaginasConsultadas(bruto.source_info?.pages_consulted, readUrl) };
};

/**
 * Por que não houve sugestão. Texto de tela: a pessoa lê e segue com as
 * páginas que já estão no modal.
 */
export const MOTIVO_DA_SUGESTAO = {
  semTexto: "Descreva o problema para receber uma sugestão.",
  semIa: "A IA da Quality não respondeu agora.",
} as const;
