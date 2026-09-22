/**
 * Sintético semanal: carrega os chamados que podem contar na semana (em aberto,
 * ou com mudança de etapa no período), calcula os marcos e monta a matriz
 * responsável × sistema × tipo (`sintetico-semanal.ts`). Sem período, a semana
 * corrente em Brasília.
 */
import { readTipo } from "@modules/reports/comum/chamado-do-relatorio";
import {
  issueWhere,
  projectNameMap,
  toIso,
  userNameMap,
  withoutPeriodo,
  type Filters,
} from "@modules/reports/comum/filtros";
import { resolvePeriodo, resolveSemanaAtual } from "@modules/reports/comum/periodo";
import { ROTULO_DO_TIPO, TIPOS_DE_CHAMADO } from "@modules/reports/comum/tipo-do-chamado";
import { GRUPOS_ENCERRADOS } from "@modules/reports/marcos/marcos";
import { findChamadosComMarcos } from "@modules/reports/marcos/marcos.service";
import { buildSinteticoSemanal } from "@modules/reports/sintetico-semanal/sintetico-semanal";
import { findInteracoes } from "@modules/reports/sintetico-semanal/sintetico-semanal.dao";

export async function findSinteticoSemanal(workspaceId: string, filtros: Filters, agora = new Date()) {
  const periodo = resolvePeriodo(filtros, () => resolveSemanaAtual(agora));
  const base = issueWhere(workspaceId, withoutPeriodo(filtros));

  const [chamados, interacoes] = await Promise.all([
    findChamadosComMarcos(workspaceId, {
      ...base,
      assignees: { some: { deletedAt: null } },
      OR: [
        { state: { group: { notIn: [...GRUPOS_ENCERRADOS] } } },
        {
          activities: {
            some: { field: "state", deletedAt: null, createdAt: { gte: periodo.inicio, lte: periodo.fim } },
          },
        },
      ],
    }),
    findInteracoes(base, periodo),
  ]);

  const linhas = buildSinteticoSemanal({
    periodo,
    interacoes,
    chamados: chamados.map((c) => ({
      projetoId: c.chamado.projectId,
      tipo: readTipo(c.chamado),
      responsaveis: c.responsaveis,
      etapa: c.chamado.state?.name ?? null,
      grupo: c.chamado.state?.group ?? null,
      finalizadoTiEm: c.marcos.finalizadoTiEm,
    })),
  });

  const [nomes, sistemas] = await Promise.all([
    userNameMap(linhas.map((l) => l.usuarioId)),
    projectNameMap(workspaceId, [...new Set(linhas.flatMap((l) => l.sistemas.map((s) => s.projetoId)))]),
  ]);

  return {
    periodo: { inicio: toIso(periodo.inicio), fim: toIso(periodo.fim) },
    tipos: TIPOS_DE_CHAMADO.map((key) => ({ key, label: ROTULO_DO_TIPO[key] })),
    usuarios: linhas
      .map((l) => ({
        user_id: l.usuarioId,
        name: nomes.get(l.usuarioId) ?? "—",
        totais: l.totais,
        sistemas: l.sistemas
          .map((s) => ({
            project_id: s.projetoId,
            name: sistemas.get(s.projetoId)?.name ?? "—",
            interacoes: s.interacoes,
            concluidos: s.concluidos,
            pendentes: s.pendentes,
          }))
          .toSorted((a, b) => a.name.localeCompare(b.name, "pt-BR")),
      }))
      .toSorted((a, b) => a.name.localeCompare(b.name, "pt-BR")),
  };
}
