/**
 * Regras de tela da solicitação de origem do chamado (linha "Solicitação" das
 * propriedades). Os dados vêm prontos no GET do chamado (`solicitacao`).
 */
import type { TOrigemDaSolicitacao, TSolicitacaoDoChamado } from "@plane/types";

export const ROTULO_DA_ORIGEM: Record<TOrigemDaSolicitacao, string> = {
  chat: "Chat",
  portal: "Portal do cliente",
  app: "Aplicativo",
};

export const hasSolicitacaoDeOrigem = (chamado: { solicitacao?: TSolicitacaoDoChamado | null }): boolean =>
  !!chamado.solicitacao;

export const getAvisoDoTextoOriginal = (solicitacao: Pick<TSolicitacaoDoChamado, "is_texto_atual">): string | null =>
  solicitacao.is_texto_atual ? "Sem edições anteriores. Este é o texto atual." : null;

const ROTULO_DA_PRIORIDADE: Record<string, string> = {
  urgent: "Urgente",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
  none: "Sem prioridade",
};

export const getRotuloDaPrioridade = (prioridade: string): string => ROTULO_DA_PRIORIDADE[prioridade] ?? prioridade;
