/**
 * DAO do balanço: data de abertura e de encerramento de cada chamado. O
 * encerramento vem do motor de marcos (a tela não grava `completed_at` ao mover
 * para Concluído; só o importador do SAC grava), então o histórico só é lido
 * para os chamados que estão encerrados.
 */
import prisma from "@db";
import type { Prisma } from "@prisma/client";
import type { ChamadoDoBalanco } from "@modules/reports/balanco/balanco";
import { buildMarcos, GRUPOS_ENCERRADOS } from "@modules/reports/marcos/marcos";
import { findGrupoDaEtapa, findTransicoesDeEtapa } from "@modules/reports/marcos/marcos.dao";

export async function findChamadosDoBalanco(
  workspaceId: string,
  where: Prisma.IssueWhereInput
): Promise<ChamadoDoBalanco[]> {
  const chamados = await prisma.issue.findMany({
    where,
    select: { id: true, createdAt: true, completedAt: true, state: { select: { name: true, group: true } } },
  });
  const encerrados = chamados.filter((c) => GRUPOS_ENCERRADOS.includes(c.state?.group ?? ""));
  const [transicoes, grupoDaEtapa] = await Promise.all([
    findTransicoesDeEtapa(encerrados.map((c) => c.id)),
    findGrupoDaEtapa(workspaceId),
  ]);

  return chamados.map((c) => ({
    criadoEm: c.createdAt,
    encerradoEm: buildMarcos(
      {
        criadoEm: c.createdAt,
        concluidoEm: c.completedAt,
        etapaAtual: c.state?.name ?? null,
        transicoes: transicoes.get(c.id) ?? [],
        atribuicoes: [],
      },
      grupoDaEtapa
    ).encerradoEm,
  }));
}

/** Data do chamado mais antigo, para o balanço anual sem período. */
export async function findPrimeiraAbertura(where: Prisma.IssueWhereInput): Promise<Date | null> {
  const primeiro = await prisma.issue.findFirst({ where, select: { createdAt: true }, orderBy: { createdAt: "asc" } });
  return primeiro?.createdAt ?? null;
}
