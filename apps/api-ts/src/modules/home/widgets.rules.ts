/**
 * Regras puras das preferências da grade de widgets da página inicial.
 *
 * Cada pessoa guarda, por espaço, `{chave, ordem, tamanho, ligado}` de cada
 * widget em `workspace_user_properties.display_filters.home_widgets`. A API não
 * conhece o catálogo (os widgets nativos moram na tela e os instalados no
 * marketplace): ela garante a FORMA do que é gravado; quem descarta widget que
 * deixou de existir e acrescenta o novo no fim é a regra da tela.
 *
 * Formato antigo (`display_filters.widget_preferences`, um objeto
 * `{ [chave]: { is_enabled, sort_order } }` com o MAIOR `sort_order` primeiro) é
 * lido e convertido; o próximo salvamento grava no formato novo e apaga o antigo.
 */
import type { FieldErrorItem, HttpError } from "@utils/field-error";
import { isTamanhoDeWidget, type TamanhoDeWidget } from "@utils/tamanho-de-widget";

export type PreferenciaDeWidget = {
  chave: string;
  ordem: number;
  /** `null` = o tamanho padrão do widget (veio do formato antigo ou de um valor que não existe mais). */
  tamanho: TamanhoDeWidget | null;
  ligado: boolean;
};

export const CHAVE_NOVA = "home_widgets";
export const CHAVE_ANTIGA = "widget_preferences";
export const LIMITE_DE_WIDGETS = 100;

/** Nativo em snake_case (`mural`, `meus_chamados`) ou instalado do marketplace (`widget:<id>`). */
const FORMATO_DA_CHAVE = /^(?:[a-z0-9_]{1,64}|widget:[A-Za-z0-9-]{1,64})$/;

type Registro = Record<string, unknown>;

const isRegistro = (valor: unknown): valor is Registro =>
  typeof valor === "object" && valor !== null && !Array.isArray(valor);

const isChaveDeWidget = (valor: unknown): valor is string => typeof valor === "string" && FORMATO_DA_CHAVE.test(valor);

const isOrdem = (valor: unknown): valor is number => Number.isInteger(valor) && (valor as number) >= 0;

/** Ordena pela ordem pedida, tira chave repetida (fica a primeira) e renumera a partir de zero. */
const withOrdemCorrida = (itens: PreferenciaDeWidget[]): PreferenciaDeWidget[] =>
  itens
    .toSorted((a, b) => a.ordem - b.ordem)
    .filter((item, indice, todos) => todos.findIndex((outro) => outro.chave === item.chave) === indice)
    .map(({ chave, tamanho, ligado }, ordem) => ({ chave, ordem, tamanho, ligado }));

const readItemNovo = (item: unknown, indice: number): PreferenciaDeWidget[] => {
  if (!isRegistro(item) || typeof item.chave !== "string" || !item.chave) return [];
  return [
    {
      chave: item.chave,
      ordem: Number.isFinite(item.ordem) ? (item.ordem as number) : indice,
      tamanho: isTamanhoDeWidget(item.tamanho) ? item.tamanho : null,
      ligado: typeof item.ligado === "boolean" ? item.ligado : true,
    },
  ];
};

const readFormatoNovo = (filtros: Registro): PreferenciaDeWidget[] | null => {
  const salvos = filtros[CHAVE_NOVA];
  if (!Array.isArray(salvos)) return null;
  return withOrdemCorrida(salvos.flatMap(readItemNovo));
};

const readFormatoAntigo = (filtros: Registro): PreferenciaDeWidget[] | null => {
  const antigos = filtros[CHAVE_ANTIGA];
  if (!isRegistro(antigos)) return null;
  const itens = Object.entries(antigos).map(([chave, valor]) => {
    const antigo = isRegistro(valor) ? valor : {};
    return {
      chave,
      sortOrder: Number.isFinite(antigo.sort_order) ? (antigo.sort_order as number) : 0,
      ligado: antigo.is_enabled !== false,
    };
  });
  // O store antigo ordenava por `sort_order` DECRESCENTE: o maior vinha primeiro.
  return itens
    .toSorted((a, b) => b.sortOrder - a.sortOrder)
    .map(({ chave, ligado }, ordem) => ({ chave, ordem, tamanho: null, ligado }));
};

/** O formato novo vence; sem ele, o antigo é convertido; sem nenhum, a tela usa o layout padrão. */
const LEITORES = [readFormatoNovo, readFormatoAntigo];

export const readPreferenciasSalvas = (displayFilters: unknown): PreferenciaDeWidget[] => {
  const filtros = isRegistro(displayFilters) ? displayFilters : {};
  for (const ler of LEITORES) {
    const lido = ler(filtros);
    if (lido) return lido;
  }
  return [];
};

const MENSAGENS = {
  lista: "Envie a lista de widgets.",
  chave: "Chave de widget inválida.",
  repetida: "Este widget já está na lista.",
  ordem: "Informe a posição do widget.",
  tamanho: "Escolha um tamanho: 1/3, 1/2, 2/3 ou inteiro.",
  ligado: "Informe se o widget fica ligado.",
  geral: "Revise os widgets da página inicial.",
} as const;

const recusar = (errors: FieldErrorItem[]): never => {
  throw { status: 400, message: MENSAGENS.geral, errors } satisfies HttpError;
};

type Checagem = {
  campo: keyof PreferenciaDeWidget;
  mensagem: string;
  isInvalido: (item: Registro, isRepetida: boolean) => boolean;
};

/** Uma linha por regra: o que torna o campo inválido e a mensagem que volta nele. */
const CHECAGENS: Checagem[] = [
  { campo: "chave", mensagem: MENSAGENS.chave, isInvalido: (item) => !isChaveDeWidget(item.chave) },
  { campo: "chave", mensagem: MENSAGENS.repetida, isInvalido: (_item, isRepetida) => isRepetida },
  { campo: "ordem", mensagem: MENSAGENS.ordem, isInvalido: (item) => !isOrdem(item.ordem) },
  { campo: "tamanho", mensagem: MENSAGENS.tamanho, isInvalido: (item) => !isTamanhoDeWidget(item.tamanho) },
  { campo: "ligado", mensagem: MENSAGENS.ligado, isInvalido: (item) => typeof item.ligado !== "boolean" },
];

const validateItem = (item: unknown, indice: number, vistas: Set<string>): FieldErrorItem[] => {
  const registro = isRegistro(item) ? item : {};
  const isRepetida = isChaveDeWidget(registro.chave) && vistas.has(registro.chave);
  if (isChaveDeWidget(registro.chave)) vistas.add(registro.chave);
  return CHECAGENS.filter((checagem) => checagem.isInvalido(registro, isRepetida)).map((checagem) => ({
    path: `widgets[${indice}].${checagem.campo}`,
    message: checagem.mensagem,
  }));
};

/** Valida o corpo `{ widgets: [...] }` enviado pela tela; cada recusa volta no caminho do item. */
export const parsePreferencias = (corpo: unknown): PreferenciaDeWidget[] => {
  const widgets = isRegistro(corpo) ? corpo.widgets : undefined;
  if (!Array.isArray(widgets) || widgets.length > LIMITE_DE_WIDGETS) {
    return recusar([{ path: "widgets", message: MENSAGENS.lista }]);
  }
  const vistas = new Set<string>();
  const erros = widgets.flatMap((item, indice) => validateItem(item, indice, vistas));
  if (erros.length) return recusar(erros);
  return withOrdemCorrida(
    (widgets as PreferenciaDeWidget[]).map(({ chave, ordem, tamanho, ligado }) => ({ chave, ordem, tamanho, ligado }))
  );
};

/** JSON gravado: o resto das preferências fica, o formato antigo sai e o novo entra. */
export const buildDisplayFilters = (existente: unknown, widgets: PreferenciaDeWidget[]): Registro => {
  const { [CHAVE_ANTIGA]: _antigo, ...resto } = isRegistro(existente) ? existente : {};
  return { ...resto, [CHAVE_NOVA]: widgets };
};
