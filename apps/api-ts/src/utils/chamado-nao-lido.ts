/**
 * Marca de não lido do chamado, por usuário.
 *
 * A marca é uma linha em `issue_unreads` (chamado × usuário): existe enquanto o
 * RESPONSÁVEL não abrir o chamado depois da última alteração relevante feita por
 * outra pessoa. Relevante é comentário novo, mudança de etapa ou de
 * responsáveis; título, prazo e o resto não acendem nada.
 *
 * Não reaproveita `notifications` de propósito: o sino só é gravado para mudança
 * de etapa, e marcar notificações como lidas ao abrir o chamado mudaria o
 * comportamento do sino.
 */
import type { Prisma } from "@prisma/client";
import prisma from "@db";

type Cliente = Prisma.TransactionClient | typeof prisma;

export type AlteracaoRelevante = { issueId: string; actorId: string | null };

/**
 * Acende a marca para todo responsável atual, menos quem fez a alteração. Quem
 * deixou de ser responsável perde a marca: ela só existe para quem tem de agir.
 */
export async function markChamadoNaoLido(
  { issueId, actorId }: AlteracaoRelevante,
  cliente: Cliente = prisma
): Promise<void> {
  const responsaveis = (
    await cliente.issueAssignee.findMany({ where: { issueId, deletedAt: null }, select: { assigneeId: true } })
  ).map((r) => r.assigneeId);
  const destinatarios = responsaveis.filter((id) => id !== actorId);

  await cliente.issueUnread.deleteMany({ where: { issueId, userId: { notIn: responsaveis } } });
  if (!destinatarios.length) return;
  await cliente.issueUnread.createMany({
    data: destinatarios.map((userId) => ({ issueId, userId })),
    skipDuplicates: true,
  });
}

/** Abrir o detalhe apaga a marca de quem abriu. */
export async function markChamadoLido(issueId: string, userId: string): Promise<void> {
  await prisma.issueUnread.deleteMany({ where: { issueId, userId } });
}

/** Filtro de "não lidos" para o `where` de `issue.findMany`. */
export const whereNaoLidoPor = (userId: string) => ({ unreads: { some: { userId } } });

/** Quais destes chamados estão não lidos para o usuário. */
async function findNaoLidos(userId: string, issueIds: string[]): Promise<Set<string>> {
  if (!issueIds.length) return new Set();
  const linhas = await prisma.issueUnread.findMany({
    where: { userId, issueId: { in: issueIds } },
    select: { issueId: true },
  });
  return new Set(linhas.map((l) => l.issueId));
}

/**
 * Carimba `isUnread` em cada chamado (lido pelo `serializeIssue`). Uma consulta
 * só para a página inteira, não uma por chamado.
 */
export async function withNaoLido<T extends { id: string }>(
  userId: string,
  chamados: T[]
): Promise<(T & { isUnread: boolean })[]> {
  const naoLidos = await findNaoLidos(
    userId,
    chamados.map((c) => c.id)
  );
  return chamados.map((c) => ({ ...c, isUnread: naoLidos.has(c.id) }));
}
