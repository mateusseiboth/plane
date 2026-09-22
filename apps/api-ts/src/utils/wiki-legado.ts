/**
 * Regras puras da importação do legado para a wiki (`scripts/import-wiki-legado.ts`):
 *  - o "disco virtual" da intranet vira a página "Processos", um bloco de anexo
 *    (`<attachment-component>`, o mesmo do editor) por arquivo;
 *  - o FAQ do SAC vira uma página por categoria, com as subcategorias em seções.
 * O script só lê as fontes e grava; o HTML sai daqui.
 */

export type ArquivoDoDisco = {
  titulo: string;
  assetId: string;
  nome: string;
  tamanho: number;
  mimeType: string;
};

export type PerguntaDoFaq = {
  pergunta: string;
  resposta: string;
  sistema: string | null;
  tags: string | null;
};

export type SubcategoriaDoFaq = {
  nome: string;
  perguntas: PerguntaDoFaq[];
};

const ENTIDADES_HTML: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

export const escapeHtml = (texto: string) => texto.replace(/[&<>"]/g, (c) => ENTIDADES_HTML[c]);

/**
 * Chave de comparação de um nome de arquivo: sem pasta, extensão, acento,
 * caixa e separadores. O disco virtual gravou "Diagrama_de_Atividade___..." para
 * o arquivo que hoje se chama "Diagrama de Atividade - ...".
 */
export function normalizeNomeDeArquivo(caminho: string): string {
  const base = caminho.split("/").pop() ?? caminho;
  return base
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Nome de arquivo legível: "fluxo_trabalho_mensal.jpg" vira "Fluxo trabalho mensal". */
const humanizeNomeDeArquivo = (arquivo: string) => {
  const semExtensao = arquivo
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();
  return semExtensao.charAt(0).toUpperCase() + semExtensao.slice(1);
};

/** Título do arquivo: o nome cadastrado no disco virtual, ou o nome do arquivo legível. */
export function findTituloDoArquivo(catalogo: ReadonlyMap<string, string>, arquivo: string): string {
  return catalogo.get(normalizeNomeDeArquivo(arquivo)) ?? humanizeNomeDeArquivo(arquivo);
}

const buildAnexoHtml = (arquivo: ArquivoDoDisco) =>
  `<attachment-component src="${escapeHtml(arquivo.assetId)}" name="${escapeHtml(arquivo.nome)}" ` +
  `size="${arquivo.tamanho}" mimetype="${escapeHtml(arquivo.mimeType)}"></attachment-component>`;

/** Página "Processos": um título e o anexo de cada arquivo, em ordem alfabética. */
export function buildProcessosHtml(arquivos: ArquivoDoDisco[]): string {
  const introducao = "<p>Processos e regras técnicas trazidos do disco virtual da intranet.</p>";
  const blocos = arquivos
    .toSorted((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"))
    .map((arquivo) => `<h3>${escapeHtml(arquivo.titulo)}</h3>${buildAnexoHtml(arquivo)}`);
  return introducao + blocos.join("");
}

const TEM_TAG_HTML = /<[a-z][^>]*>/i;
const BLOCOS_PERIGOSOS = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
const ATRIBUTOS_DE_EVENTO = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

/**
 * Resposta do FAQ em HTML. O SAC guardava ora texto puro, ora HTML do editor
 * dele: o texto vira parágrafos (linha em branco separa parágrafo); o HTML é
 * mantido, sem `<script>`, `<style>` e atributos de evento.
 */
export function buildRespostaHtml(resposta: string): string {
  if (TEM_TAG_HTML.test(resposta)) return resposta.replace(BLOCOS_PERIGOSOS, "").replace(ATRIBUTOS_DE_EVENTO, "");
  return resposta
    .split(/\n\s*\n/)
    .map((paragrafo) => paragrafo.trim())
    .filter(Boolean)
    .map((paragrafo) => `<p>${escapeHtml(paragrafo).replace(/\r?\n/g, "<br>")}</p>`)
    .join("");
}

const buildPerguntaHtml = (item: PerguntaDoFaq) =>
  [
    `<h3>${escapeHtml(item.pergunta)}</h3>`,
    buildRespostaHtml(item.resposta),
    item.sistema ? `<p>Sistema: ${escapeHtml(item.sistema)}</p>` : "",
    item.tags?.trim() ? `<p>Palavras-chave: ${escapeHtml(item.tags.trim())}</p>` : "",
  ].join("");

/** Página de uma categoria do FAQ: cada subcategoria é uma seção com suas perguntas. */
export function buildFaqCategoriaHtml(subcategorias: SubcategoriaDoFaq[]): string {
  return subcategorias
    .filter((sub) => sub.perguntas.length > 0)
    .map((sub) => `<h2>${escapeHtml(sub.nome)}</h2>${sub.perguntas.map(buildPerguntaHtml).join("")}`)
    .join("");
}

/** Texto puro para `description_stripped` (a busca da wiki lê esta coluna). */
export const stripHtml = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
