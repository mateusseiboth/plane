/**
 * O chamado como os relatórios o mostram: número anual (N-AAAA), identificador
 * do sistema (PROJ-123), título, sistema, entidade, etapa, prioridade e tipo.
 * Um `select` e um serializador para todos os relatórios novos.
 */
import type { Prisma } from "@prisma/client";
import { formatNumeroDoChamado } from "@utils/numero-do-chamado";
import { PRIORITY_LABELS } from "@modules/reports/comum/rotulos";
import { ROTULO_DO_TIPO, resolveTipoDoChamado } from "@modules/reports/comum/tipo-do-chamado";

export const SELECT_CHAMADO_DO_RELATORIO = {
  id: true,
  name: true,
  sequenceId: true,
  ticketSequence: true,
  ticketYear: true,
  legacyTicketNumber: true,
  priority: true,
  createdAt: true,
  completedAt: true,
  projectId: true,
  project: { select: { name: true, identifier: true } },
  entity: { select: { name: true, city: true, state: true } },
  state: { select: { name: true, group: true } },
  labels: { where: { deletedAt: null }, select: { label: { select: { name: true } } } },
} satisfies Prisma.IssueSelect;

export type ChamadoDoRelatorio = Prisma.IssueGetPayload<{ select: typeof SELECT_CHAMADO_DO_RELATORIO }>;

export const readEtiquetas = (c: { labels: { label: { name: string } | null }[] }) =>
  c.labels.map((l) => l.label?.name).filter((n): n is string => !!n);

export const readTipo = (c: { labels: { label: { name: string } | null }[] }) => resolveTipoDoChamado(readEtiquetas(c));

export function serializeChamadoDoRelatorio(c: ChamadoDoRelatorio) {
  const tipo = readTipo(c);
  return {
    id: c.id,
    ticket_number: formatNumeroDoChamado(c),
    legacy_ticket_number: c.legacyTicketNumber,
    sequence_id: c.sequenceId,
    identifier: c.project ? `${c.project.identifier}-${c.sequenceId}` : null,
    name: c.name,
    project_id: c.projectId,
    project: c.project?.name ?? null,
    entity: c.entity?.name ?? null,
    entity_city: c.entity?.city ?? null,
    entity_uf: c.entity?.state ?? null,
    state: c.state?.name ?? null,
    state_group: c.state?.group ?? null,
    priority: c.priority,
    priority_label: PRIORITY_LABELS[c.priority] ?? c.priority,
    tipo,
    tipo_label: ROTULO_DO_TIPO[tipo],
    created_at: c.createdAt.toISOString(),
  };
}
