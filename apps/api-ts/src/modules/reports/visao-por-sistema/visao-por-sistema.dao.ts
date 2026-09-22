/** DAO da visão por sistema: sistema, etapa e etiquetas de cada chamado do filtro. */
import prisma from "@db";
import type { Prisma } from "@prisma/client";
import { readTipo } from "@modules/reports/comum/chamado-do-relatorio";
import type { ChamadoDoSistema } from "@modules/reports/visao-por-sistema/visao-por-sistema";

export async function findChamadosDoSistema(where: Prisma.IssueWhereInput): Promise<ChamadoDoSistema[]> {
  const chamados = await prisma.issue.findMany({
    where,
    select: {
      projectId: true,
      state: { select: { name: true, group: true } },
      labels: { where: { deletedAt: null }, select: { label: { select: { name: true } } } },
    },
  });
  return chamados.map((c) => ({
    projetoId: c.projectId,
    etapa: c.state?.name ?? null,
    grupo: c.state?.group ?? null,
    tipo: readTipo(c),
  }));
}
