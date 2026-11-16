/**
 * A faixa de URGENTES do topo: todo urgente em aberto do espaço, com o setor em
 * que está (ver setor-do-chamado.service). O setor é o que diz ao atendimento
 * com quem está o pedido do cliente.
 */
import { findUrgentesAbertos } from "@modules/urgentes/urgentes.dao";
import { findSetoresDosChamados } from "@modules/urgentes/setor-do-chamado.service";

type Urgente = Awaited<ReturnType<typeof findUrgentesAbertos>>[number];

const serializeUrgente = (urgente: Urgente, setor: string | null) => ({
  id: urgente.id,
  name: urgente.name,
  priority: urgente.priority,
  sequence_id: urgente.sequenceId,
  legacy_ticket_number: urgente.legacyTicketNumber ?? null,
  state: urgente.state ? { name: urgente.state.name, group: urgente.state.group, color: urgente.state.color } : null,
  project: urgente.project
    ? { id: urgente.project.id, identifier: urgente.project.identifier, name: urgente.project.name }
    : null,
  assignee_ids: urgente.assignees.map((a) => a.assigneeId),
  setor,
  updated_at: urgente.updatedAt?.toISOString(),
});

export async function listUrgentes(workspaceId: string) {
  const urgentes = await findUrgentesAbertos(workspaceId);
  const setores = await findSetoresDosChamados(
    workspaceId,
    urgentes.map((u) => ({ id: u.id, state: u.state, assigneeIds: u.assignees.map((a) => a.assigneeId) }))
  );
  return urgentes.map((urgente) => serializeUrgente(urgente, setores.get(urgente.id) ?? null));
}
