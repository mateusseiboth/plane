/** DAO das horas analíticas: os lançamentos de tempo do filtro, com o chamado de cada um. */
import prisma from "@db";
import type { Prisma } from "@prisma/client";

/** Teto de linhas: o relatório é para leitura e impressão, não exportação em massa. */
export const LIMITE_DE_LANCAMENTOS = 5000;

export async function findLancamentos(where: Prisma.IssueTimeLogWhereInput) {
  return prisma.issueTimeLog.findMany({
    where,
    select: {
      id: true,
      memberId: true,
      durationMinutes: true,
      loggedDate: true,
      description: true,
      issue: {
        select: {
          id: true,
          name: true,
          sequenceId: true,
          ticketSequence: true,
          ticketYear: true,
          project: { select: { name: true, identifier: true } },
        },
      },
    },
    orderBy: { loggedDate: "asc" },
    take: LIMITE_DE_LANCAMENTOS,
  });
}
