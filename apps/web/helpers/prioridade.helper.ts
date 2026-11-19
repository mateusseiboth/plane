/** Prioridade "urgente" = cliente parado. Regra única do destaque do chamado. */
const PRIORIDADE_URGENTE = "urgent";

export const isPrioridadeUrgente = (prioridade: string | null | undefined): boolean =>
  prioridade === PRIORIDADE_URGENTE;
