/**
 * Chamados devolvidos por período (`chamados_flag_devolvido.php` do SAC):
 * chamado que voltou de "Em Teste" para "Em Desenvolvimento". O legado marcava a
 * mensagem de devolução (tipo 3); aqui a devolução é a própria transição de etapa.
 * Sem período, vale todo o histórico.
 */
import { STATE } from "@utils/permissions";
import { serializeChamadoDoRelatorio } from "@modules/reports/comum/chamado-do-relatorio";
import { issueWhere, readNome, toIso, userNameMap, withoutPeriodo, type Filters } from "@modules/reports/comum/filtros";
import { isNoPeriodo, type Periodo } from "@modules/reports/comum/periodo";
import { findChamadosComMarcos } from "@modules/reports/marcos/marcos.service";

const TODO_O_HISTORICO: Periodo = { inicio: new Date(0), fim: new Date(8.64e15) };

export async function findDevolvidos(workspaceId: string, filtros: Filters) {
  const periodo: Periodo = {
    inicio: filtros.dateFrom ?? TODO_O_HISTORICO.inicio,
    fim: filtros.dateTo ?? TODO_O_HISTORICO.fim,
  };
  const chamados = await findChamadosComMarcos(workspaceId, {
    ...issueWhere(workspaceId, withoutPeriodo(filtros)),
    activities: {
      some: {
        field: "state",
        deletedAt: null,
        oldValue: STATE.EM_TESTE,
        newValue: STATE.EM_DESENVOLVIMENTO,
        createdAt: { gte: periodo.inicio, lte: periodo.fim },
      },
    },
  });

  const devolvidos = chamados
    .map((c) => ({ ...c, devolucoes: c.marcos.devolucoes.filter((d) => isNoPeriodo(d.em, periodo)) }))
    .filter((c) => c.devolucoes.length)
    .toSorted((a, b) => b.devolucoes.at(-1)!.em.getTime() - a.devolucoes.at(-1)!.em.getTime());

  const nomes = await userNameMap(devolvidos.flatMap((c) => c.devolucoes.map((d) => d.por)));
  const rows = devolvidos.map((c) => ({
    ...serializeChamadoDoRelatorio(c.chamado),
    total_devolucoes: c.devolucoes.length,
    ultima_devolucao_em: toIso(c.devolucoes.at(-1)!.em),
    devolucoes: c.devolucoes.map((d) => ({ em: toIso(d.em), por: readNome(nomes, d.por) })),
  }));

  return {
    kpis: { chamados: rows.length, devolucoes: rows.reduce((soma, r) => soma + r.total_devolucoes, 0) },
    rows,
  };
}
