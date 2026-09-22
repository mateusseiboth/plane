/**
 * Data de conclusão do chamado (`issues.completed_at`).
 *
 * Quem GRAVA é o banco: o gatilho `issues_sync_completed_at` (migração
 * 20260923090000_data_de_conclusao) preenche a data quando o chamado entra numa
 * etapa do grupo `completed` e limpa quando sai, em qualquer caminho (PATCH,
 * edição em massa, triagem, solicitação, criação, rascunho, importação). Mesma
 * regra do Plane original (`Issue._sync_completed_at`): cancelado não é
 * conclusão. Data informada na própria gravação (importador do SAC) é mantida.
 *
 * Este módulo só expõe o backfill.
 */
import prisma from "@db";

/**
 * Acerta os chamados gravados antes do gatilho. Idempotente: a segunda chamada
 * devolve 0. Roda na migração e fica disponível em scripts/backfill-completed-at.ts.
 *
 *  - concluído sem data: a última entrada na etapa atual pelo histórico; sem
 *    histórico (edição em massa antiga não registrava), o `updated_at`;
 *  - fora do grupo concluído com data: limpa (reaberto antes do gatilho).
 */
export async function backfillDatasDeConclusao(): Promise<number> {
  const [linha] = await prisma.$queryRaw<{ acertados: number }[]>`SELECT backfill_issue_completed_at() AS acertados`;
  return Number(linha?.acertados ?? 0);
}
