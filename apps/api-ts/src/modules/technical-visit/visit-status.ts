/**
 * Situação da visita técnica, como gravada em `technical_visits.status`.
 * Fonte única: rota, relatório e importador do SAC leem daqui.
 */
export const VISIT_STATUS = {
  AGENDADA: 0,
  EM_ANDAMENTO: 1,
  RELATORIO: 2,
  AGUARDANDO_ASSINATURA: 3,
  CONCLUIDA: 4,
  CANCELADA: 5,
} as const;

export type VisitStatus = (typeof VISIT_STATUS)[keyof typeof VISIT_STATUS];

export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  [VISIT_STATUS.AGENDADA]: "Agendada",
  [VISIT_STATUS.EM_ANDAMENTO]: "Em Andamento",
  [VISIT_STATUS.RELATORIO]: "Relatório em Elaboração",
  [VISIT_STATUS.AGUARDANDO_ASSINATURA]: "Aguardando Assinatura",
  [VISIT_STATUS.CONCLUIDA]: "Concluída",
  [VISIT_STATUS.CANCELADA]: "Cancelada",
};

export const getVisitStatusLabel = (status: number): string =>
  VISIT_STATUS_LABELS[status as VisitStatus] ?? "Desconhecido";
