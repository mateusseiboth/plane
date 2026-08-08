/**
 * Vocabulário compartilhado das telas de funções e permissões.
 *
 * Só rótulos e o catálogo de etapas usado nos seletores. Quem pode fazer o quê
 * e quais transições cada função executa vêm sempre de `GET /roles/` — nunca
 * daqui.
 */

/** Rótulos em português dos grupos de etapa usados pelo backend. */
export const STATE_GROUP_LABELS: Record<string, string> = {
  triage: "Triagem",
  backlog: "Backlog",
  unstarted: "Não iniciado",
  started: "Em andamento",
  completed: "Concluído",
  cancelled: "Cancelado",
};

export type TWorkflowStateOption = {
  group: string;
  name: string;
};

/**
 * Etapas padrão do fluxo (espelha DEFAULT_STATES da migration do backend).
 * Serve apenas para popular os seletores de "de → para" ao montar uma transição
 * nova; as transições já configuradas sempre vêm da API.
 */
export const WORKFLOW_STATE_TEMPLATE: TWorkflowStateOption[] = [
  { group: "triage", name: "Triagem" },
  { group: "backlog", name: "Pendências" },
  { group: "unstarted", name: "A Fazer" },
  { group: "started", name: "Em Análise" },
  { group: "started", name: "Em Desenvolvimento" },
  { group: "started", name: "Em Teste" },
  { group: "completed", name: "Concluído" },
  { group: "cancelled", name: "Cancelado" },
];

/** Rótulo legível de um lado da transição (`state_name` nulo = grupo inteiro). */
export const describeTransitionSide = (group: string, stateName: string | null): string =>
  stateName ?? `Qualquer etapa em ${STATE_GROUP_LABELS[group] ?? group}`;
