/**
 * Painel de TV do TI e da Qualidade. A tela recarrega pelo SSE a cada mudança
 * de chamado; aqui só se monta o retrato de agora. Urgente primeiro, depois o
 * mais antigo.
 */
import { PRIORIDADES } from "@utils/prioridade";
import { serializeChamadoDoRelatorio } from "@modules/reports/comum/chamado-do-relatorio";
import { ParametroDoRelatorioInvalidoError } from "@modules/reports/comum/erros";
import { findFuncoesDosMembros } from "@modules/reports/comum/funcoes.dao";
import { issueWhere, userNameMap, withoutPeriodo, type Filters } from "@modules/reports/comum/filtros";
import {
  buildPainel,
  isSetorDoPainel,
  readEtapasDoPainel,
  type SetorDoPainel,
} from "@modules/reports/painel-tv/painel-tv";
import { findChamadosDoPainel } from "@modules/reports/painel-tv/painel-tv.dao";

const DIA_MS = 86_400_000;

export function requireSetor(valor: unknown): SetorDoPainel {
  if (isSetorDoPainel(valor)) return valor;
  throw new ParametroDoRelatorioInvalidoError("Informe o setor do painel: ti ou qualidade.");
}

const ordemDaPrioridade = (p: string) => {
  const i = (PRIORIDADES as readonly string[]).indexOf(p);
  return i < 0 ? PRIORIDADES.length : i;
};

export async function findPainel(workspaceId: string, setor: SetorDoPainel, filtros: Filters, agora = new Date()) {
  const [chamados, funcoes] = await Promise.all([
    findChamadosDoPainel(issueWhere(workspaceId, withoutPeriodo(filtros)), readEtapasDoPainel(setor)),
    findFuncoesDosMembros(workspaceId),
  ]);
  const ordenados = chamados.toSorted((a, b) => ordemDaPrioridade(a.priority) - ordemDaPrioridade(b.priority));
  const painel = buildPainel(
    setor,
    ordenados.map((c) => ({
      ...c,
      etapa: c.state?.name ?? null,
      prioridade: c.priority,
      responsaveis: c.assignees.map((a) => a.assigneeId),
    })),
    (id) => funcoes.get(id)?.key ?? null
  );

  const nomes = await userNameMap(ordenados.flatMap((c) => c.assignees.map((a) => a.assigneeId)));
  const serialize = (c: (typeof painel.colunas)[number]["chamados"][number]) => ({
    ...serializeChamadoDoRelatorio(c),
    age_days: Math.floor((agora.getTime() - c.createdAt.getTime()) / DIA_MS),
    responsaveis: c.responsaveis.map((id) => nomes.get(id) ?? "—"),
  });

  return {
    setor: painel.setor,
    titulo: painel.titulo,
    total: painel.total,
    gerado_em: agora.toISOString(),
    colunas: painel.colunas.map((coluna) => ({ ...coluna, chamados: coluna.chamados.map(serialize) })),
    por_pessoa: painel.por_pessoa
      .map((p) => ({ user_id: p.usuarioId, name: nomes.get(p.usuarioId) ?? "—", chamados: p.chamados.map(serialize) }))
      .toSorted((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    alertas: painel.alertas.map(serialize),
  };
}
