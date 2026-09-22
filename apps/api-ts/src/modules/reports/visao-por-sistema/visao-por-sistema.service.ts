/**
 * Extensões de "Chamados por sistema" e "Chamados por tipo": a situação do
 * chamado no painel do SAC (pendente, em andamento, a homologar, concluído) e o
 * cruzamento sistema × tipo. Os dois relatórios leem a mesma contagem.
 */
import type { Prisma } from "@prisma/client";
import { projectNameMap } from "@modules/reports/comum/filtros";
import { TIPOS_DE_CHAMADO } from "@modules/reports/comum/tipo-do-chamado";
import { buildVisaoPorSistema, type ContagemDoSistema } from "@modules/reports/visao-por-sistema/visao-por-sistema";
import { findChamadosDoSistema } from "@modules/reports/visao-por-sistema/visao-por-sistema.dao";

export async function findVisaoPorSistema(where: Prisma.IssueWhereInput): Promise<Map<string, ContagemDoSistema>> {
  return buildVisaoPorSistema(await findChamadosDoSistema(where));
}

/** Campos que "Chamados por sistema" acrescenta a cada linha. */
export function serializeSituacoesDoSistema(contagem: ContagemDoSistema | undefined) {
  if (!contagem) return { situacoes: null, por_tipo: null };
  const { por_tipo, ...situacoes } = contagem;
  return { situacoes, por_tipo };
}

/** Matriz sistema × tipo de "Chamados por tipo". */
export async function findMatrizSistemaPorTipo(workspaceId: string, where: Prisma.IssueWhereInput) {
  const visao = await findVisaoPorSistema(where);
  const nomes = await projectNameMap(workspaceId, [...visao.keys()]);
  return [...visao.entries()]
    .map(([projetoId, contagem]) => ({
      project_id: projetoId,
      name: nomes.get(projetoId)?.name ?? "—",
      ...Object.fromEntries(TIPOS_DE_CHAMADO.map((tipo) => [tipo, contagem.por_tipo[tipo].total])),
      total: contagem.total,
    }))
    .toSorted((a, b) => b.total - a.total);
}
