/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Regras puras da grade de widgets da página inicial.
 *
 * O catálogo (widgets nativos + instalados do marketplace) diz o que EXISTE; a
 * preferência salva diz a ordem, o tamanho e o ligado/desligado de cada um. A
 * grade é a junção dos dois: o que foi salvo e ainda existe, na ordem salva; o
 * que é novo, no fim. A posição no array É a ordem.
 */

export const TAMANHOS_DE_WIDGET = ["1/3", "1/2", "2/3", "1/1"] as const;
export type TTamanhoDeWidget = (typeof TAMANHOS_DE_WIDGET)[number];

/** O que a API guarda por widget. `tamanho: null` = o padrão do widget. */
export type TPreferenciaDeWidget = {
  chave: string;
  ordem: number;
  tamanho: TTamanhoDeWidget | null;
  ligado: boolean;
};

export type TItemDaGrade = { chave: string; tamanho: TTamanhoDeWidget; ligado: boolean };

export type TEntradaDoCatalogo = { chave: string; tamanhoPadrao: TTamanhoDeWidget };

export type TLadoDaSoltura = "antes" | "depois";

export const ROTULO_DO_TAMANHO: Record<TTamanhoDeWidget, string> = {
  "1/3": "1/3",
  "1/2": "1/2",
  "2/3": "2/3",
  "1/1": "Inteiro",
};

/** Tamanho de um instalado cujo manifesto não declara `defaultSize`: meia largura, como a grade antiga. */
const TAMANHO_PADRAO_DE_INSTALADO: TTamanhoDeWidget = "1/2";
const PREFIXO_DE_INSTALADO = "widget:";

export const isTamanhoDeWidget = (valor: unknown): valor is TTamanhoDeWidget =>
  TAMANHOS_DE_WIDGET.includes(valor as TTamanhoDeWidget);

export const normalizeTamanho = (valor: unknown, padrao: TTamanhoDeWidget): TTamanhoDeWidget =>
  isTamanhoDeWidget(valor) ? valor : padrao;

export const buildLayoutPadrao = (catalogo: TEntradaDoCatalogo[]): TItemDaGrade[] =>
  catalogo.map(({ chave, tamanhoPadrao }) => ({ chave, tamanho: tamanhoPadrao, ligado: true }));

const isPrimeiraOcorrencia = (item: { chave: string }, indice: number, todos: { chave: string }[]) =>
  todos.findIndex((outro) => outro.chave === item.chave) === indice;

export const mergeLayout = (catalogo: TEntradaDoCatalogo[], salvos: TPreferenciaDeWidget[]): TItemDaGrade[] => {
  const padraoPorChave = new Map(catalogo.map((entrada) => [entrada.chave, entrada.tamanhoPadrao]));
  // `toSorted` não está no `lib` do web (ES2022); ordena uma cópia.
  // oxlint-disable-next-line unicorn/no-array-sort
  const ordenados = [...salvos].sort((a, b) => a.ordem - b.ordem);
  const mantidos = ordenados
    .filter((salvo) => padraoPorChave.has(salvo.chave))
    .filter(isPrimeiraOcorrencia)
    .map((salvo) => ({
      chave: salvo.chave,
      tamanho: normalizeTamanho(salvo.tamanho, padraoPorChave.get(salvo.chave)!),
      ligado: salvo.ligado !== false,
    }));
  const jaNaGrade = new Set(mantidos.map((item) => item.chave));
  const novos = buildLayoutPadrao(catalogo.filter((entrada) => !jaNaGrade.has(entrada.chave)));
  return [...mantidos, ...novos];
};

const clamp = (valor: number, minimo: number, maximo: number) => Math.min(Math.max(valor, minimo), maximo);

export const moveWidget = (layout: TItemDaGrade[], chave: string, destino: number): TItemDaGrade[] => {
  const origem = layout.findIndex((item) => item.chave === chave);
  if (origem < 0) return layout;
  const resto = layout.filter((_, indice) => indice !== origem);
  const alvo = clamp(destino, 0, resto.length);
  return [...resto.slice(0, alvo), layout[origem], ...resto.slice(alvo)];
};

export const moveWidgetBy = (layout: TItemDaGrade[], chave: string, passo: number): TItemDaGrade[] =>
  moveWidget(layout, chave, layout.findIndex((item) => item.chave === chave) + passo);

/** Arrastar e soltar: o widget vai para antes ou depois do alvo em que foi solto. */
export const moveWidgetAoLado = (
  layout: TItemDaGrade[],
  chave: string,
  alvo: string,
  lado: TLadoDaSoltura
): TItemDaGrade[] => {
  if (chave === alvo || !layout.some((item) => item.chave === alvo)) return layout;
  const semOrigem = layout.filter((item) => item.chave !== chave);
  const indiceDoAlvo = semOrigem.findIndex((item) => item.chave === alvo);
  return moveWidget(layout, chave, lado === "antes" ? indiceDoAlvo : indiceDoAlvo + 1);
};

export type TPassoDoTeclado = "anterior" | "proximo" | "primeiro" | "ultimo";
export type TDestinoDoPasso = { alvo: string; lado: TLadoDaSoltura };

type TResolverDePasso = (visiveis: { chave: string }[], indice: number) => TDestinoDoPasso | null;

const destino = (item: { chave: string } | undefined, lado: TLadoDaSoltura) =>
  item ? { alvo: item.chave, lado } : null;

/** Cada passo do teclado vira "soltar antes/depois de tal vizinho visível" (o oculto não conta). */
const RESOLVER_DO_PASSO: Record<TPassoDoTeclado, TResolverDePasso> = {
  anterior: (visiveis, indice) => destino(visiveis[indice - 1], "antes"),
  proximo: (visiveis, indice) => destino(visiveis[indice + 1], "depois"),
  primeiro: (visiveis, indice) => (indice === 0 ? null : destino(visiveis[0], "antes")),
  ultimo: (visiveis, indice) => (indice === visiveis.length - 1 ? null : destino(visiveis.at(-1), "depois")),
};

export const resolveVizinhoDoPasso = (
  visiveis: { chave: string }[],
  chave: string,
  passo: TPassoDoTeclado
): TDestinoDoPasso | null => {
  const indice = visiveis.findIndex((item) => item.chave === chave);
  if (indice < 0) return null;
  return RESOLVER_DO_PASSO[passo](visiveis, indice);
};

const LADO_DA_BORDA: Record<string, TLadoDaSoltura> = {
  top: "antes",
  left: "antes",
  bottom: "depois",
  right: "depois",
};

/** Borda mais próxima do ponteiro ao soltar: em cima ou à esquerda cai antes do alvo. */
export const resolveLadoDaBorda = (borda: string | null): TLadoDaSoltura => LADO_DA_BORDA[borda ?? ""] ?? "depois";

const updateItem = (layout: TItemDaGrade[], chave: string, mudanca: Partial<TItemDaGrade>) =>
  layout.map((item) => (item.chave === chave ? { ...item, ...mudanca } : item));

export const setTamanho = (layout: TItemDaGrade[], chave: string, tamanho: TTamanhoDeWidget) =>
  updateItem(layout, chave, { tamanho });

export const setLigado = (layout: TItemDaGrade[], chave: string, ligado: boolean) =>
  updateItem(layout, chave, { ligado });

/**
 * O que vai para a API. `orfas` são preferências de widgets que não estão no
 * catálogo AGORA porque a lista de instalados não carregou: elas seguem no fim
 * para a pessoa não perder o que configurou por causa de uma falha de rede.
 */
export const toPreferencias = (layout: TItemDaGrade[], orfas: TPreferenciaDeWidget[] = []): TPreferenciaDeWidget[] =>
  [...layout, ...orfas].map(({ chave, tamanho, ligado }, ordem) => ({ chave, ordem, tamanho, ligado }));

export const buildChaveDeInstalado = (id: string) => `${PREFIXO_DE_INSTALADO}${id}`;

export const readIdDeInstalado = (chave: string): string | null =>
  chave.startsWith(PREFIXO_DE_INSTALADO) ? chave.slice(PREFIXO_DE_INSTALADO.length) : null;

/** Título do cartão e tamanho padrão que o `manifest.json` de um instalado declara. */
export const readManifestoDaHome = (manifesto: unknown, nome: string) => {
  const campos = (typeof manifesto === "object" && manifesto !== null ? manifesto : {}) as Record<string, unknown>;
  const titulo = typeof campos.title === "string" && campos.title.trim() ? campos.title.trim() : nome;
  return { titulo, tamanhoPadrao: normalizeTamanho(campos.defaultSize, TAMANHO_PADRAO_DE_INSTALADO) };
};

export const buildAnuncioDaPosicao = (titulo: string, indice: number, total: number) =>
  `${titulo} movido para a posição ${indice + 1} de ${total}.`;
