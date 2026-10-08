/**
 * DAO da movimentação do chamado: só lê os marcos que a regra compara. Toda
 * decisão vive em `movimentacao.rules.ts`.
 *
 * A última mudança de etapa vem do histórico (`issue_activities`, campo
 * "state"), que o PATCH e a ação em lote gravam a cada troca.
 */
import prisma from "@db";
import type { MarcosDaMovimentacao } from "@modules/issue/movimentacao.rules";

const MAIS_RECENTE = { orderBy: { createdAt: "desc" }, select: { createdAt: true } } as const;

export async function findMarcosDaMovimentacao(issueId: string, userId: string): Promise<MarcosDaMovimentacao | null> {
  const [chamado, mudanca, comentario] = await Promise.all([
    prisma.issue.findFirst({ where: { id: issueId }, select: { createdAt: true } }),
    prisma.issueActivity.findFirst({ where: { issueId, field: "state", deletedAt: null }, ...MAIS_RECENTE }),
    prisma.issueComment.findFirst({ where: { issueId, actorId: userId, deletedAt: null }, ...MAIS_RECENTE }),
  ]);
  if (!chamado) return null;
  return {
    criadoEm: chamado.createdAt,
    ultimaMudancaDeEtapaEm: mudanca?.createdAt ?? null,
    ultimoComentarioDoUsuarioEm: comentario?.createdAt ?? null,
  };
}
