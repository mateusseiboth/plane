/**
 * Cores dos painéis de TV.
 *
 * A paleta é a categórica validada da referência de visualização de dados (tons
 * do tema escuro), conferida para daltonismo: nenhum par vizinho fica abaixo do
 * piso de separação, e todas passam de 3:1 contra o fundo do painel. Por isso os
 * valores são LITERAIS aqui, e não tons soltos escolhidos por gosto.
 *
 * A cor nunca carrega sozinha o significado: toda coluna tem rótulo, todo
 * marcador do mapa tem número e toda situação tem texto ao lado.
 */

import type { FaixaDoVolume, UrgenciaDaEspera } from "./painel-helpers";

/** Fundo do painel; é contra ele que as cores foram validadas. */
export const FUNDO_DO_PAINEL = "#101014";
export const FUNDO_DO_CARTAO = "#1a1a19";

/** Nome da cor da coluna (vem do backend) → tom validado. */
export const COR_DA_COLUNA: Record<string, string> = {
  azul: "#3987e5",
  laranja: "#d95926",
  verde: "#199e70",
  ouro: "#c98500",
  rosa: "#d55181",
  roxo: "#9085e9",
  // Neutro de propósito: coluna sem identidade própria ("Pendente").
  cinza: "#8b8b86",
};

export const corDaColuna = (cor: string): string => COR_DA_COLUNA[cor] ?? COR_DA_COLUNA.cinza!;

/** Situação (nunca reutilizada como cor de série). */
export const STATUS = {
  bom: "#0ca30c",
  atencao: "#fab219",
  serio: "#ec835a",
  critico: "#d03b3b",
} as const;

/** Prioridade do chamado; "urgente" é o "cliente parado" do SAC. */
export const COR_DA_PRIORIDADE: Record<string, string> = {
  urgent: STATUS.critico,
  high: STATUS.serio,
  medium: STATUS.atencao,
  low: "#3987e5",
  none: "#8b8b86",
};

export const ROTULO_DA_PRIORIDADE: Record<string, string> = {
  urgent: "Cliente parado",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
  none: "Sem prioridade",
};

/** Volume de chamados abertos no marcador do mapa. */
export const COR_DA_FAIXA: Record<FaixaDoVolume, string> = {
  vazio: "#5b5b57",
  baixo: STATUS.bom,
  medio: STATUS.atencao,
  alto: STATUS.critico,
};

export const ROTULO_DA_FAIXA: Record<FaixaDoVolume, string> = {
  vazio: "Sem chamado aberto",
  baixo: "Até 4 chamados",
  medio: "5 a 14 chamados",
  alto: "15 ou mais",
};

/** Espera na fila do atendimento. */
export const COR_DA_URGENCIA: Record<UrgenciaDaEspera, string> = {
  normal: "#c3c2b7",
  atencao: STATUS.atencao,
  critico: STATUS.critico,
};

/** Gravidade do atraso do backup (o backend manda a chave). */
export const COR_DA_GRAVIDADE: Record<string, string> = {
  atencao: STATUS.atencao,
  alerta: STATUS.serio,
  critico: STATUS.critico,
};

/** Situação do atendente na lateral do painel do atendimento. */
export const COR_DO_ATENDENTE: Record<string, string> = {
  online: STATUS.bom,
  invisivel: STATUS.atencao,
  offline: "#5b5b57",
};

export const ROTULO_DO_ATENDENTE: Record<string, string> = {
  online: "Online",
  invisivel: "Invisível",
  offline: "Offline",
};
