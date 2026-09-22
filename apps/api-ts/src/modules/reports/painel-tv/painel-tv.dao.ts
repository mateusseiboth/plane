/** DAO do painel de TV: chamados em aberto nas etapas que o painel do setor mostra. */
import prisma from "@db";
import type { Prisma } from "@prisma/client";
import { SELECT_CHAMADO_DO_RELATORIO } from "@modules/reports/comum/chamado-do-relatorio";

export async function findChamadosDoPainel(where: Prisma.IssueWhereInput, etapas: string[]) {
  return prisma.issue.findMany({
    where: { ...where, state: { name: { in: etapas } } },
    select: { ...SELECT_CHAMADO_DO_RELATORIO, assignees: { where: { deletedAt: null }, select: { assigneeId: true } } },
    orderBy: { createdAt: "asc" },
  });
}
