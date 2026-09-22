/**
 * Chamados com os marcos por etapa já calculados: base dos relatórios
 * analítico por usuário, devolvidos, sintético semanal e balanço.
 */
import prisma from "@db";
import type { Prisma } from "@prisma/client";
import { SELECT_CHAMADO_DO_RELATORIO, type ChamadoDoRelatorio } from "@modules/reports/comum/chamado-do-relatorio";
import { readNome, toIso } from "@modules/reports/comum/filtros";
import { buildMarcos, type Atribuicao, type Marcos } from "@modules/reports/marcos/marcos";
import { findAtribuicoes, findGrupoDaEtapa, findTransicoesDeEtapa } from "@modules/reports/marcos/marcos.dao";

export type ChamadoComMarcos = {
  chamado: ChamadoDoRelatorio;
  marcos: Marcos;
  atribuicoes: Atribuicao[];
  responsaveis: string[];
};

export async function findChamadosComMarcos(
  workspaceId: string,
  where: Prisma.IssueWhereInput
): Promise<ChamadoComMarcos[]> {
  const chamados = await prisma.issue.findMany({
    where,
    select: SELECT_CHAMADO_DO_RELATORIO,
    orderBy: { createdAt: "asc" },
  });
  const ids = chamados.map((c) => c.id);
  const [transicoes, { atribuicoes, responsaveis }, grupoDaEtapa] = await Promise.all([
    findTransicoesDeEtapa(ids),
    findAtribuicoes(ids),
    findGrupoDaEtapa(workspaceId),
  ]);

  return chamados.map((chamado) => {
    const doChamado = atribuicoes.get(chamado.id) ?? [];
    const marcos = buildMarcos(
      {
        criadoEm: chamado.createdAt,
        concluidoEm: chamado.completedAt,
        etapaAtual: chamado.state?.name ?? null,
        transicoes: transicoes.get(chamado.id) ?? [],
        atribuicoes: doChamado,
      },
      grupoDaEtapa
    );
    return { chamado, marcos, atribuicoes: doChamado, responsaveis: responsaveis.get(chamado.id) ?? [] };
  });
}

/** Quem aparece como "por" nos marcos, para resolver os nomes de uma vez. */
export const readAutoresDosMarcos = (m: Marcos) => [
  m.finalizadoTiPor,
  m.homologadoPor,
  m.encerradoPor,
  ...m.devolucoes.map((d) => d.por),
];

export function serializeMarcos(m: Marcos, nomes: Map<string, string>, atribuidoEm: Date | null = m.atribuidoEm) {
  return {
    aberto_em: toIso(m.abertoEm),
    atribuido_em: toIso(atribuidoEm),
    inicio_ti_em: toIso(m.inicioTiEm),
    finalizado_ti_em: toIso(m.finalizadoTiEm),
    finalizado_ti_por: readNome(nomes, m.finalizadoTiPor),
    homologado_em: toIso(m.homologadoEm),
    homologado_por: readNome(nomes, m.homologadoPor),
    encerrado_em: toIso(m.encerradoEm),
    encerrado_por: readNome(nomes, m.encerradoPor),
    devolucoes: m.devolucoes.length,
  };
}
