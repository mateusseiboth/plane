/** DAO do sintético semanal: interações (comentários) por pessoa e sistema no período. */
import prisma from "@db";
import type { Prisma } from "@prisma/client";
import type { Periodo } from "@modules/reports/comum/periodo";
import type { InteracaoDoSintetico } from "@modules/reports/sintetico-semanal/sintetico-semanal";

export async function findInteracoes(issue: Prisma.IssueWhereInput, periodo: Periodo): Promise<InteracaoDoSintetico[]> {
  const grupos = await prisma.issueComment.groupBy({
    by: ["actorId", "projectId"],
    where: { deletedAt: null, issue, createdAt: { gte: periodo.inicio, lte: periodo.fim } },
    _count: { id: true },
  });
  return grupos
    .filter((g) => !!g.actorId)
    .map((g) => ({ usuarioId: g.actorId as string, projetoId: g.projectId, total: g._count.id }));
}
