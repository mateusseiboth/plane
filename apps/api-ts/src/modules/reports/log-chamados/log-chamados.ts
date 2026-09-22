/**
 * Log consolidado de chamados (`relatorioLogChamados*.php` do SAC): o histórico
 * de todos os chamados num lugar só, juntando as atividades (`issue_activities`)
 * e os comentários. Puro.
 */

/** Rótulo em português de cada campo da trilha de atividades. */
const ROTULO_DO_CAMPO: Record<string, string> = {
  issue: "Criou o chamado",
  state: "Mudou a etapa",
  priority: "Mudou a prioridade",
  assignees: "Mudou os responsáveis",
  labels: "Mudou as etiquetas",
  name: "Mudou o título",
  description: "Mudou a descrição",
  target_date: "Mudou o prazo",
  start_date: "Mudou a data de início",
  parent: "Mudou o chamado pai",
  estimate_point: "Mudou a estimativa",
  intake_replica: "Replicou a solicitação",
  comment: "Comentou",
};

export function describeAtividade({ field }: { verb: string; field: string | null }): string {
  return ROTULO_DO_CAMPO[field ?? ""] ?? `Alterou ${field ?? "o chamado"}`;
}

export function mergeLogDeChamados<T extends { em: Date }>(atividades: T[], comentarios: T[]): T[] {
  return [...atividades, ...comentarios].toSorted((a, b) => b.em.getTime() - a.em.getTime());
}
