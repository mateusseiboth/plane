/**
 * Chave de API de painel de TV (W18): o crachá dos painéis que rodam sem login.
 *
 * A TV só sabe abrir uma URL, então a chave viaja no cabeçalho `X-Panel-Key` e,
 * quando é a página do painel que está carregando, em `?key=`. O banco guarda
 * SÓ o hash SHA-256 e os quatro últimos caracteres: a chave em claro aparece
 * uma única vez, na criação.
 *
 * Tudo aqui é puro — nada de banco.
 */

import { createHash, randomBytes } from "crypto";

export const PAINEIS_DA_CHAVE = ["ti", "qualidade", "atendimento", "mapa", "backups"] as const;
export type PainelDaChave = (typeof PAINEIS_DA_CHAVE)[number];

const PAINEIS = new Set<string>(PAINEIS_DA_CHAVE);

export const isPainelDaChave = (valor: unknown): valor is PainelDaChave =>
  typeof valor === "string" && PAINEIS.has(valor);

/**
 * Escopo curinga: a chave GERAL abre todos os painéis, inclusive os que ainda
 * não existem. É o padrão da tela — a TV da recepção costuma alternar entre os
 * painéis, e uma chave por painel viraria quatro links para colar na TV.
 */
export const ESCOPO_TODOS = "todos";

const isEscopoConhecido = (valor: unknown): boolean => valor === ESCOPO_TODOS || isPainelDaChave(valor);

export const PREFIXO_DA_CHAVE = "ptv_";
export const CABECALHO_DA_CHAVE = "x-panel-key";

const BYTES_DA_CHAVE = 32;

/** `ptv_` + 32 bytes aleatórios em base64url (sem `=`), ~47 caracteres. */
export function generateChave(random: (tamanho: number) => Buffer = randomBytes): string {
  return `${PREFIXO_DA_CHAVE}${random(BYTES_DA_CHAVE).toString("base64url")}`;
}

/** SHA-256 em hexadecimal. Espaço em volta não conta: a TV cola a chave da URL. */
export const hashChave = (valor: string): string => createHash("sha256").update(valor.trim()).digest("hex");

export const readUltimos4 = (valor: string): string => valor.trim().slice(-4);

export const isEscopoLiberado = (escopos: readonly string[], painel: PainelDaChave): boolean =>
  escopos.includes(ESCOPO_TODOS) || escopos.includes(painel);

type Cabecalhos = Record<string, string | undefined> | undefined;
type Consulta = Record<string, unknown> | undefined;

/** O cabeçalho manda; a URL é o caminho de quem acabou de abrir a página na TV. */
export function readChaveDaRequisicao(headers: Cabecalhos, query: Consulta): string | null {
  const doCabecalho = headers?.[CABECALHO_DA_CHAVE];
  if (typeof doCabecalho === "string" && doCabecalho.trim()) return doCabecalho.trim();
  const daUrl = query?.key;
  if (typeof daUrl === "string" && daUrl.trim()) return daUrl.trim();
  return null;
}

export type ErroDeCampo = { path: string; message: string };
export type EscopoDaChave = PainelDaChave | typeof ESCOPO_TODOS;
export type ChaveInput = { name: string; scopes: EscopoDaChave[] };

const readEscopos = (valor: unknown): string[] => {
  if (Array.isArray(valor)) return valor.map((v) => String(v).trim()).filter(Boolean);
  if (typeof valor === "string") {
    return valor
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
};

/** Formulário da chave: nome e painéis. Cada recusa volta para o campo da tela. */
export function parseChaveInput(body: Record<string, unknown>): { data: ChaveInput; erros: ErroDeCampo[] } {
  const erros: ErroDeCampo[] = [];
  const name = String(body.name ?? "").trim();
  if (!name) erros.push({ path: "name", message: "Informe o nome da chave." });

  const escopos = [...new Set(readEscopos(body.scopes))];
  const desconhecido = escopos.find((e) => !isEscopoConhecido(e));
  if (desconhecido) erros.push({ path: "scopes", message: `Painel desconhecido: ${desconhecido}.` });
  else if (!escopos.length) erros.push({ path: "scopes", message: "Escolha ao menos um painel." });

  // "Todos os painéis" engole os demais: guardar os dois faria a lista da tela
  // dizer "geral + mapa", como se mapa fosse um limite que não existe.
  const finais = escopos.includes(ESCOPO_TODOS) ? [ESCOPO_TODOS] : escopos;
  return { data: { name: name.slice(0, 120), scopes: finais as EscopoDaChave[] }, erros };
}

/**
 * Título de cada painel, para quem só precisa citá-lo (ex.: os cartões de
 * "Links úteis"). O painel em si desenha o próprio cabeçalho; aqui é só o nome.
 */
export const TITULO_DO_PAINEL: Record<PainelDaChave, string> = {
  ti: "Painel do TI",
  qualidade: "Painel da Qualidade",
  atendimento: "Painel do Atendimento",
  mapa: "Mapa de chamados",
  backups: "Painel de Backups",
};
