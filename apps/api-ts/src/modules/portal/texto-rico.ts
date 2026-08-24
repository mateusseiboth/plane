/**
 * O texto rico escrito no portal, limpo antes de virar chamado.
 *
 * O editor do portal é um `contenteditable` simples, e o que ele manda é HTML
 * cru vindo de um navegador que não é nosso: o cliente cola de Word, de e-mail,
 * de outro sistema — e, no pior caso, escreve à mão. **Nenhuma decisão de
 * segurança pode ficar do lado do cliente**, então tudo que chega passa por
 * aqui, numa lista de permissão: o que não está nela não entra.
 *
 * Duas ideias sustentam o arquivo:
 *
 *  1. **Lista de permissão, nunca de bloqueio.** Não tentamos adivinhar o que é
 *     perigoso; sabemos o que é aceitável (parágrafo, negrito, lista, link) e
 *     descartamos o resto. Atributo nenhum sobrevive, exceto o `href` de link
 *     com esquema conhecido.
 *  2. **A saída é HTML do produto.** A equipe abre esse texto no editor do
 *     Plane, então `div` vira parágrafo, `b` vira `strong`, e o que sobra
 *     sempre é bloco — é o formato que o resto do sistema já guarda.
 *
 * Mídia (imagem, vídeo) não entra no texto de propósito: no portal ela é anexo
 * do chamado, que é onde a equipe já procura arquivo (ver `anexos.ts`).
 */

const LIMITES = {
  /** Teto do que aceitamos analisar — acima disso é ataque ou colagem acidental. */
  entrada: 120_000,
  /** Teto do texto guardado, contando só caractere visível. */
  texto: 20_000,
} as const;

/** O que fica, já com o nome que o editor do produto entende. */
const TAGS_PERMITIDAS: ReadonlyMap<string, string> = new Map([
  ["p", "p"],
  ["div", "p"],
  // Título de cliente quase sempre é ênfase disfarçada; vira parágrafo.
  ["h1", "p"],
  ["h2", "p"],
  ["h3", "p"],
  ["h4", "p"],
  ["h5", "p"],
  ["h6", "p"],
  ["br", "br"],
  ["strong", "strong"],
  ["b", "strong"],
  ["em", "em"],
  ["i", "em"],
  ["u", "u"],
  ["s", "s"],
  ["strike", "s"],
  ["del", "s"],
  ["ul", "ul"],
  ["ol", "ol"],
  ["li", "li"],
  ["blockquote", "blockquote"],
  ["code", "code"],
  ["pre", "pre"],
  ["a", "a"],
]);

/** Aqui o conteúdo some junto com a tag: o que está dentro não é texto do cliente. */
const CONTEUDO_DESCARTADO = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "math",
  "iframe",
  "object",
  "embed",
  "head",
  "title",
  "audio",
  "video",
]);

/** Blocos: a presença de um deles diz que a saída já está no formato do produto. */
const TEM_BLOCO = /<(p|ul|ol|blockquote|pre)[ >]/;

const ESQUEMA_ACEITO = /^(https?:\/\/|mailto:)/i;

/** `&` que já faz parte de uma entidade fica; o solto vira `&amp;`. */
const E_COMERCIAL_SOLTO = /&(?![a-zA-Z][a-zA-Z0-9]{1,30};|#\d{1,7};|#[xX][0-9a-fA-F]{1,6};)/g;

type Marcacao =
  | { tipo: "texto"; valor: string }
  | { tipo: "abre"; nome: string; atributos: string; sozinha: boolean }
  | { tipo: "fecha"; nome: string };

/**
 * Onde a tag termina, respeitando aspas.
 *
 * Sem isso, `<a href="data:text/html,<script>">` seria cortado no `<` de dentro
 * do atributo e o resto vazaria como texto — que é exatamente a brecha que se
 * usa para escapar de sanitizador ingênuo.
 */
function fimDaTag(entrada: string, inicio: number): number {
  let aspas = "";
  for (let i = inicio; i < entrada.length; i++) {
    const caractere = entrada[i]!;
    if (aspas) {
      if (caractere === aspas) aspas = "";
      continue;
    }
    if (caractere === '"' || caractere === "'") {
      aspas = caractere;
      continue;
    }
    if (caractere === ">") return i;
  }
  return -1;
}

/** Quebra o HTML em marcações e texto, sem julgar nada — quem julga é quem consome. */
function* percorrer(entrada: string): Generator<Marcacao> {
  let posicao = 0;
  while (posicao < entrada.length) {
    const abertura = entrada.indexOf("<", posicao);
    if (abertura < 0) {
      yield { tipo: "texto", valor: entrada.slice(posicao) };
      return;
    }
    if (abertura > posicao) yield { tipo: "texto", valor: entrada.slice(posicao, abertura) };

    if (entrada.startsWith("<!--", abertura)) {
      const fim = entrada.indexOf("-->", abertura);
      posicao = fim < 0 ? entrada.length : fim + 3;
      continue;
    }

    const fim = fimDaTag(entrada, abertura + 1);
    if (fim < 0) {
      // `<` solto no fim do texto: é texto, não marcação.
      yield { tipo: "texto", valor: entrada.slice(abertura) };
      return;
    }
    const cru = entrada.slice(abertura + 1, fim);
    posicao = fim + 1;

    // Doctype e instrução de processamento não têm conteúdo que interesse.
    if (cru.startsWith("!") || cru.startsWith("?")) continue;
    if (cru.startsWith("/")) {
      yield { tipo: "fecha", nome: cru.slice(1).trim().toLowerCase() };
      continue;
    }
    const nome = (cru.match(/^[a-zA-Z][a-zA-Z0-9:_-]*/)?.[0] ?? "").toLowerCase();
    if (!nome) continue;
    yield {
      tipo: "abre",
      nome,
      atributos: cru.slice(nome.length),
      sozinha: cru.trimEnd().endsWith("/"),
    };
  }
}

function escaparTexto(valor: string): string {
  return valor.replace(E_COMERCIAL_SOLTO, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escaparAtributo(valor: string): string {
  return valor.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** O `href` do link, ou `null` quando o esquema não é de navegar. */
function enderecoDoLink(atributos: string): string | null {
  const achado = atributos.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i);
  const bruto = (achado?.[2] ?? achado?.[3] ?? achado?.[4] ?? "").trim();
  // Controle no meio ("java\0script:") é o disfarce clássico; sai antes de conferir.
  // oxlint-disable-next-line no-control-regex -- é o ponto: caractere de controle sai fora.
  const endereco = bruto.replace(/[\u0000-\u0020\u007f]/g, "");
  if (!ESQUEMA_ACEITO.test(endereco)) return null;
  return escaparAtributo(endereco);
}

/**
 * Os atributos que a tag leva para a saída.
 * `null` significa "descarte a tag e fique com o texto dela".
 */
function atributosDe(tag: string, atributos: string): string | null {
  if (tag !== "a") return "";
  const endereco = enderecoDoLink(atributos);
  if (!endereco) return null;
  // O link é de terceiro: abre fora, sem passar a página de origem nem crédito.
  return ` href="${endereco}" target="_blank" rel="noopener noreferrer nofollow"`;
}

type Ignorando = { nome: string; profundidade: number };

/** Enquanto ignoramos um bloco (script, style…), só o fechamento dele importa. */
function seguirIgnorando(estado: Ignorando, marca: Marcacao): Ignorando | null {
  if (marca.tipo === "abre" && marca.nome === estado.nome && !marca.sozinha) {
    return { ...estado, profundidade: estado.profundidade + 1 };
  }
  if (marca.tipo !== "fecha" || marca.nome !== estado.nome) return estado;
  const profundidade = estado.profundidade - 1;
  return profundidade > 0 ? { ...estado, profundidade } : null;
}

/** O texto do cliente pronto para virar `description_html` do chamado. */
export function limparTextoDoCliente(bruto: unknown): string {
  const entrada = String(bruto ?? "").slice(0, LIMITES.entrada);
  const saida: string[] = [];
  const abertas: string[] = [];
  let disponivel = LIMITES.texto;
  let ignorando: Ignorando | null = null;

  for (const marca of percorrer(entrada)) {
    if (ignorando) {
      ignorando = seguirIgnorando(ignorando, marca);
      continue;
    }

    if (marca.tipo === "texto") {
      const pedaco = marca.valor.slice(0, disponivel);
      disponivel -= pedaco.length;
      saida.push(escaparTexto(pedaco));
      continue;
    }

    if (marca.tipo === "fecha") {
      const nome = TAGS_PERMITIDAS.get(marca.nome);
      const posicao = nome ? abertas.lastIndexOf(nome) : -1;
      if (posicao < 0) continue;
      while (abertas.length > posicao) saida.push(`</${abertas.pop()}>`);
      continue;
    }

    if (CONTEUDO_DESCARTADO.has(marca.nome)) {
      if (!marca.sozinha) ignorando = { nome: marca.nome, profundidade: 1 };
      continue;
    }

    const nome = TAGS_PERMITIDAS.get(marca.nome);
    // Tag desconhecida (span, table, img…): some a marcação, fica o texto.
    if (!nome) continue;
    if (nome === "br") {
      saida.push("<br />");
      continue;
    }
    const atributos = atributosDe(nome, marca.atributos);
    if (atributos === null) continue;
    saida.push(`<${nome}${atributos}>`);
    abertas.push(nome);
  }

  while (abertas.length) saida.push(`</${abertas.pop()}>`);

  const html = saida.join("");
  const sobrou = html.replace(/<[^>]*>/g, "").trim();
  if (!sobrou) return "<p></p>";
  if (TEM_BLOCO.test(html)) return html;
  return `<p>${html}</p>`;
}

const ENTIDADES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodificar(entidade: string, corpo: string): string {
  const nomeada = ENTIDADES[corpo.toLowerCase()];
  if (nomeada) return nomeada;
  if (!corpo.startsWith("#")) return entidade;
  const codigo =
    corpo.startsWith("#x") || corpo.startsWith("#X") ? parseInt(corpo.slice(2), 16) : Number(corpo.slice(1));
  if (!Number.isFinite(codigo) || codigo <= 0 || codigo > 0x10ffff) return entidade;
  return String.fromCodePoint(codigo);
}

/** O mesmo texto sem marcação — é o que alimenta a busca do produto. */
export function textoSemMarcacao(html: unknown): string {
  return String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,30});/g, (todo, corpo: string) =>
      decodificar(todo, corpo)
    )
    .replace(/\s+/g, " ")
    .trim();
}
