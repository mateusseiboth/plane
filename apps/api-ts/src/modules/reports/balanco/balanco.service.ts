/**
 * Balanço mensal ou anual com saldo acumulado e período livre. Sem período: o
 * mensal cobre o ano corrente; o anual vai do ano do chamado mais antigo até hoje.
 */
import { requireOpcao } from "@modules/reports/comum/erros";
import { issueWhere, toIso, withoutPeriodo, type Filters } from "@modules/reports/comum/filtros";
import { resolveAnoAtual, resolvePeriodo, type Periodo } from "@modules/reports/comum/periodo";
import { buildBalanco, GRANULARIDADES, type Granularidade } from "@modules/reports/balanco/balanco";
import { findChamadosDoBalanco, findPrimeiraAbertura } from "@modules/reports/balanco/balanco.dao";

export const readGranularidade = (valor: unknown) =>
  requireOpcao(valor, GRANULARIDADES, "mes", "Use mes ou ano no agrupamento do balanço.");

type PeriodoPadrao = (where: object, agora: Date) => Promise<Periodo>;

const PERIODO_PADRAO: Record<Granularidade, PeriodoPadrao> = {
  mes: async (_, agora) => resolveAnoAtual(agora),
  ano: async (where, agora) => ({
    inicio: (await findPrimeiraAbertura(where)) ?? resolveAnoAtual(agora).inicio,
    fim: agora,
  }),
};

export async function findBalanco(
  workspaceId: string,
  filtros: Filters,
  granularidade: Granularidade,
  agora = new Date()
) {
  const where = issueWhere(workspaceId, withoutPeriodo(filtros));
  const padrao = await PERIODO_PADRAO[granularidade](where, agora);
  const periodo = resolvePeriodo(filtros, () => padrao);
  const balanco = buildBalanco({
    chamados: await findChamadosDoBalanco(workspaceId, where),
    ...periodo,
    granularidade,
  });

  return {
    granularidade,
    periodo: { inicio: toIso(periodo.inicio), fim: toIso(periodo.fim) },
    linhas: balanco.linhas.map((l) => ({ ...l, inicio: toIso(l.inicio) })),
    totais: balanco.totais,
  };
}
