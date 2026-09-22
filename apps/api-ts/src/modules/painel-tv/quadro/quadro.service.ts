/**
 * Quadro do painel de TV do TI e da Qualidade: as colunas do espaço (ou as
 * padrão), os chamados de cada uma e os urgentes que acendem o alerta.
 *
 * "Cliente parado" do SAC é a prioridade urgente. Urgente primeiro, depois o
 * mais antigo: a TV mostra o começo da fila, não o fim.
 */

import { PRIORIDADES } from "@utils/prioridade";
import { issueWhere, userNameMap, type Filters } from "@modules/reports/comum/filtros";
import { serializeChamadoDoRelatorio } from "@modules/reports/comum/chamado-do-relatorio";
import { chaveDao, type ChaveDao } from "@modules/painel-tv/chaves/chave.dao";
import {
  buildFiltroDoQuadro,
  buildQuadro,
  readColunasDoPainel,
  type ChamadoDoQuadro,
  type PainelDoQuadro,
  type RegraDaColuna,
} from "@modules/painel-tv/quadro/colunas";
import { findChamadosDoQuadro, type ChamadoDoPainel } from "@modules/painel-tv/quadro/quadro.dao";

const DIA_MS = 86_400_000;
/** Cartões que cada coluna manda para a tela; a contagem do cabeçalho é a real. */
const CARTOES_POR_COLUNA = 60;

const ordemDaPrioridade = (prioridade: string) => {
  const posicao = (PRIORIDADES as readonly string[]).indexOf(prioridade);
  return posicao < 0 ? PRIORIDADES.length : posicao;
};

type ChamadoDoQuadroComDados = ChamadoDoQuadro & { dados: ChamadoDoPainel };

const toChamadoDoQuadro = (chamado: ChamadoDoPainel): ChamadoDoQuadroComDados => ({
  id: chamado.id,
  etapa: chamado.state?.name ?? null,
  grupo: chamado.state?.group ?? null,
  prioridade: chamado.priority,
  temResponsavel: chamado.assignees.length > 0,
  concluidoEm: chamado.completedAt,
  dados: chamado,
});

export type QuadroDeps = { dao: Pick<ChaveDao, "findConfig">; now: () => Date };

export async function findQuadro(
  workspaceId: string,
  painel: PainelDoQuadro,
  filtros: Filters,
  { dao = chaveDao, now = () => new Date() }: Partial<QuadroDeps> = {}
) {
  const agora = now();
  const config = await dao.findConfig(workspaceId, painel);
  const colunas: RegraDaColuna[] = readColunasDoPainel(painel, config?.columns ?? null);
  const filtro = buildFiltroDoQuadro(colunas, agora);

  const chamados = await findChamadosDoQuadro(issueWhere(workspaceId, filtros), filtro.etapas, filtro.concluidosDesde);
  const ordenados = chamados
    .map(toChamadoDoQuadro)
    .toSorted((a, b) => ordemDaPrioridade(a.prioridade) - ordemDaPrioridade(b.prioridade));

  const quadro = buildQuadro(colunas, ordenados, agora);
  const nomes = await userNameMap(chamados.flatMap((c) => c.assignees.map((a) => a.assigneeId)));

  const serialize = (chamado: ChamadoDoQuadroComDados) => ({
    ...serializeChamadoDoRelatorio(chamado.dados),
    project_identifier: chamado.dados.project?.identifier ?? null,
    project_logo: chamado.dados.project?.iconProp ?? null,
    age_days: Math.floor((agora.getTime() - chamado.dados.createdAt.getTime()) / DIA_MS),
    responsaveis: chamado.dados.assignees.map((a) => nomes.get(a.assigneeId) ?? "—"),
  });

  return {
    painel,
    gerado_em: agora.toISOString(),
    total: quadro.total,
    colunas: quadro.colunas.map((coluna) => ({
      chave: coluna.chave,
      rotulo: coluna.rotulo,
      cor: coluna.cor,
      total: coluna.total,
      percentual: coluna.percentual,
      chamados: coluna.chamados.slice(0, CARTOES_POR_COLUNA).map(serialize),
    })),
    urgentes: quadro.urgentes.map(serialize),
  };
}
