/**
 * A diferença entre o texto do autor e a proposta da IA, palavra a palavra.
 *
 * Serve à comparação lado a lado do "Melhorar com IA" (Parte 3 do contrato em
 * `.claude/CONTRATO_IA_REQUISITOS.md`): quem escreveu precisa **ver** o que sai
 * e o que entra antes de decidir, e não existe decisão informada olhando dois
 * blocos de texto corrido.
 *
 * Três escolhas moram aqui:
 *
 * 1. **Compara o texto legível, não a marcação.** O conteúdo é HTML de editor;
 *    diferenciar `<p>` de `<div>` encheria a tela de ruído que não interessa a
 *    ninguém. As tags viram quebras de linha e somem.
 * 2. **A unidade é a palavra.** Caractere a caractere pinta metade de cada
 *    palavra e cansa de ler; linha a linha esconde a troca de uma palavra no
 *    meio de um parágrafo, que é justamente o que a IA costuma fazer.
 * 3. **Sem biblioteca.** Um LCS com poda de prefixo e sufixo resolve texto de
 *    chamado de sobra, e o monorepo não tem nenhuma biblioteca de diff — não
 *    vale uma dependência nova.
 */

/** `saiu` só existe no texto do autor; `entrou` só na proposta da IA. */
export type TTipoDeTrecho = "igual" | "saiu" | "entrou";

export type TTrechoDeDiferenca = {
  tipo: TTipoDeTrecho;
  texto: string;
};

/**
 * Acima disto a tabela do LCS passa de alguns milhões de células e a conta pesa
 * mais do que a informação vale. Descrição de chamado dificilmente chega perto;
 * quando chegar, o trecho diferente vira um bloco só — continua legível.
 */
const LIMITE_DE_PALAVRAS = 1200;

/** Fecho de bloco e `<br>` valem uma quebra de linha; o resto some. */
const FIM_DE_BLOCO = /<\/(?:p|div|li|h[1-6]|blockquote|pre|tr|figcaption)>|<br\s*\/?>/gi;

const ENTIDADES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

const ENTIDADE = /&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;|&apos;/gi;

/** HTML do editor no texto que uma pessoa leria em voz alta. */
export const textoLegivel = (html: string): string =>
  html
    .replace(FIM_DE_BLOCO, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(ENTIDADE, (entidade) => ENTIDADES[entidade.toLowerCase()] ?? entidade)
    .split("\n")
    .map((linha) => linha.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** Cada palavra é um token; cada quebra de linha também, para não se perder. */
const emTokens = (texto: string): string[] => texto.match(/\n|\S+/g) ?? [];

type TCorrida = {
  tipo: TTipoDeTrecho;
  tokens: string[];
};

/** Junta a corrida de volta em texto: espaço entre palavras, nada ao redor da quebra. */
const juntar = (tokens: string[]): string =>
  tokens.reduce((texto, token) => {
    if (texto === "") return token;
    if (token === "\n" || texto.endsWith("\n")) return texto + token;
    return `${texto} ${token}`;
  }, "");

const acrescentar = (corridas: TCorrida[], tipo: TTipoDeTrecho, tokens: string[]): TCorrida[] => {
  if (tokens.length === 0) return corridas;
  const ultima = corridas[corridas.length - 1];
  // `push(...tokens)` estoura a pilha em texto muito longo; o laço não estoura.
  if (ultima?.tipo === tipo) {
    tokens.forEach((token) => ultima.tokens.push(token));
    return corridas;
  }
  corridas.push({ tipo, tokens: tokens.slice() });
  return corridas;
};

/** Quantos tokens iniciais as duas listas têm em comum. */
const prefixoComum = (antes: string[], depois: string[]): number => {
  const teto = Math.min(antes.length, depois.length);
  let total = 0;
  while (total < teto && antes[total] === depois[total]) total += 1;
  return total;
};

/** Idem pelo fim, sem invadir o prefixo já contado. */
const sufixoComum = (antes: string[], depois: string[], prefixo: number): number => {
  const teto = Math.min(antes.length, depois.length) - prefixo;
  let total = 0;
  while (total < teto && antes[antes.length - 1 - total] === depois[depois.length - 1 - total]) total += 1;
  return total;
};

/**
 * O miolo diferente, resolvido pela maior subsequência comum.
 *
 * A tabela é preenchida de trás para a frente para que a volta seja um
 * caminhamento simples de `i`/`j` crescentes — assim a ordem de leitura sai
 * pronta, sem inverter listas no fim.
 */
const compararMiolo = (antes: string[], depois: string[]): TCorrida[] => {
  const n = antes.length;
  const m = depois.length;
  const largura = m + 1;
  const tabela = new Uint32Array((n + 1) * largura);

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      tabela[i * largura + j] =
        antes[i] === depois[j]
          ? tabela[(i + 1) * largura + j + 1] + 1
          : Math.max(tabela[(i + 1) * largura + j], tabela[i * largura + j + 1]);
    }
  }

  const corridas: TCorrida[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (antes[i] === depois[j]) {
      acrescentar(corridas, "igual", [antes[i]]);
      i += 1;
      j += 1;
      continue;
    }
    if (tabela[(i + 1) * largura + j] >= tabela[i * largura + j + 1]) {
      acrescentar(corridas, "saiu", [antes[i]]);
      i += 1;
      continue;
    }
    acrescentar(corridas, "entrou", [depois[j]]);
    j += 1;
  }
  acrescentar(corridas, "saiu", antes.slice(i));
  acrescentar(corridas, "entrou", depois.slice(j));
  return corridas;
};

/**
 * O espaço que separa duas corridas fica na corrida **anterior**, nunca na
 * seguinte. Duas razões, nesta ordem:
 *
 * - o realce de uma palavra removida não carrega um espaço pintado na frente;
 * - cada lado continua legível depois de esconder o que não é dele. Se o espaço
 *   morasse no trecho seguinte, filtrar o `entrou` do meio grudaria as palavras
 *   vizinhas do lado do autor.
 *
 * Por isso o espaço entra mesmo quando o trecho seguinte começa em quebra de
 * linha: essa quebra pode ser justamente a que o outro lado não tem, e um espaço
 * sobrando antes de um fim de linha ninguém vê.
 */
const emTrechos = (corridas: TCorrida[]): TTrechoDeDiferenca[] => {
  const trechos: TTrechoDeDiferenca[] = [];
  corridas.forEach((corrida) => {
    const texto = juntar(corrida.tokens);
    if (texto === "") return;
    const anterior = trechos[trechos.length - 1];
    if (anterior && !anterior.texto.endsWith("\n")) anterior.texto += " ";
    trechos.push({ tipo: corrida.tipo, texto });
  });
  return trechos;
};

/** A comparação entre dois textos puros, na ordem em que se lê. */
export const diferencaEmPalavras = (antes: string, depois: string): TTrechoDeDiferenca[] => {
  const tokensAntes = emTokens(antes);
  const tokensDepois = emTokens(depois);

  const prefixo = prefixoComum(tokensAntes, tokensDepois);
  const sufixo = sufixoComum(tokensAntes, tokensDepois, prefixo);
  const mioloAntes = tokensAntes.slice(prefixo, tokensAntes.length - sufixo);
  const mioloDepois = tokensDepois.slice(prefixo, tokensDepois.length - sufixo);

  const grandeDemais = mioloAntes.length > LIMITE_DE_PALAVRAS || mioloDepois.length > LIMITE_DE_PALAVRAS;
  const meio = grandeDemais
    ? acrescentar(acrescentar([], "saiu", mioloAntes), "entrou", mioloDepois)
    : compararMiolo(mioloAntes, mioloDepois);

  const corridas = acrescentar([], "igual", tokensAntes.slice(0, prefixo));
  meio.forEach((corrida) => acrescentar(corridas, corrida.tipo, corrida.tokens));
  acrescentar(corridas, "igual", tokensAntes.slice(tokensAntes.length - sufixo));

  return emTrechos(corridas);
};

/** A mesma comparação partindo do HTML que o editor guarda. */
export const diferencaEntreHtml = (antesHtml: string, depoisHtml: string): TTrechoDeDiferenca[] =>
  diferencaEmPalavras(textoLegivel(antesHtml), textoLegivel(depoisHtml));

/** `false` quando a IA mexeu só na marcação: as palavras são as mesmas. */
export const temDiferenca = (trechos: TTrechoDeDiferenca[]): boolean =>
  trechos.some((trecho) => trecho.tipo !== "igual");
