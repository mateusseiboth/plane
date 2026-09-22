/**
 * DAO do quadro dos painéis de TV: os chamados das etapas que as colunas
 * pedem. Só acesso a dados — quem decide a coluna de cada chamado é
 * `quadro/colunas.ts`.
 */
import prisma from "@db";
import type { Prisma } from "@prisma/client";
import { SELECT_CHAMADO_DO_RELATORIO } from "@modules/reports/comum/chamado-do-relatorio";

/** O ícone do sistema (`icon_prop`) é o que a TV mostra grande em cada cartão. */
export const SELECT_CHAMADO_DO_PAINEL = {
  ...SELECT_CHAMADO_DO_RELATORIO,
  project: { select: { name: true, identifier: true, iconProp: true } },
  assignees: { where: { deletedAt: null }, select: { assigneeId: true } },
} satisfies Prisma.IssueSelect;

export type ChamadoDoPainel = Prisma.IssueGetPayload<{ select: typeof SELECT_CHAMADO_DO_PAINEL }>;

/** Teto de segurança: painel nenhum desenha 5 mil cartões, e a contagem é por coluna. */
const LIMITE = 5000;

export async function findChamadosDoQuadro(
  where: Prisma.IssueWhereInput,
  etapas: string[],
  concluidosDesde: Date | null
): Promise<ChamadoDoPainel[]> {
  const doPeriodo: Prisma.IssueWhereInput =
    concluidosDesde === null ? {} : { OR: [{ completedAt: null }, { completedAt: { gte: concluidosDesde } }] };
  return prisma.issue.findMany({
    where: { ...where, state: { name: { in: etapas } }, ...doPeriodo },
    select: SELECT_CHAMADO_DO_PAINEL,
    orderBy: { createdAt: "asc" },
    take: LIMITE,
  });
}
