/**
 * Horas analíticas por analista: o "Tempo gasto" ganha, por pessoa, a lista dos
 * lançamentos (data, minutos, descrição e chamado com o número anual).
 */
import type { Prisma } from "@prisma/client";
import { formatNumeroDoChamado } from "@utils/numero-do-chamado";
import { round, userNameMap } from "@modules/reports/comum/filtros";
import { groupLancamentosPorAnalista } from "@modules/reports/horas-analiticas/horas-analiticas";
import { findLancamentos } from "@modules/reports/horas-analiticas/horas-analiticas.dao";

const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

export async function findHorasPorAnalista(where: Prisma.IssueTimeLogWhereInput) {
  const lancamentos = await findLancamentos(where);
  const grupos = groupLancamentosPorAnalista(
    lancamentos.map((l) => ({ ...l, usuarioId: l.memberId, minutos: l.durationMinutes, data: l.loggedDate }))
  );
  const nomes = await userNameMap(grupos.map((g) => g.usuarioId));

  return grupos.map((g) => ({
    user_id: g.usuarioId,
    name: nomes.get(g.usuarioId) ?? "—",
    minutes: g.minutos,
    hours: round(g.minutos / 60, 1),
    entries: g.lancamentos.map((l) => ({
      id: l.id,
      logged_date: dateOnly(l.loggedDate),
      minutes: l.durationMinutes,
      hours: round(l.durationMinutes / 60, 2),
      description: l.description,
      issue: {
        id: l.issue.id,
        ticket_number: formatNumeroDoChamado(l.issue),
        identifier: l.issue.project ? `${l.issue.project.identifier}-${l.issue.sequenceId}` : null,
        name: l.issue.name,
        project: l.issue.project?.name ?? null,
      },
    })),
  }));
}
