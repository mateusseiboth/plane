/**
 * A conversa como cada espectador pode vê-la.
 *
 * `serializeSession` é a forma completa, do banco para o JSON da API. O que muda
 * de espectador para espectador sai daqui como função à parte, para a rota
 * escolher explicitamente — e para caber em teste sem subir o servidor.
 */

import { isAbandonado, rotuloDoAbandono } from "@/ciclo-de-vida/abandono";

/** Nada aqui lê o banco: a entrada é o registro do Prisma já carregado. */
export function serializeSession(s: any) {
  return {
    id: s.id,
    protocol: s.protocol,
    channel: s.channel,
    workspace_id: s.workspaceId,
    contact_id: s.contactId ?? null,
    // Responsável (cadastro do cliente) já vinculado a este atendimento.
    entity_contact_id: s.entityContactId ?? null,
    client_name: s.clientName ?? s.contact?.name ?? null,
    contact_email: s.contact?.email ?? null,
    contact_entity_id: s.contact?.entityId ?? null,
    client_phone: s.clientPhone ?? null,
    status: s.status,
    queue_id: s.queueId ?? null,
    assigned_attendant_id: s.assignedAttendantId ?? null,
    project_id: s.projectId ?? null,
    project_identifier: s.projectIdentifier ?? null,
    project_name: s.projectName ?? null,
    last_client_message_at: s.lastClientMessageAt ?? null,
    last_attendant_message_at: s.lastAttendantMessageAt ?? null,
    client_last_read_at: s.clientLastReadAt ?? null,
    rating_score: s.ratingScore ?? null,
    rating_comment: s.ratingComment ?? null,
    rating_state: s.ratingState ?? null,
    created_at: s.createdAt,
    closed_at: s.closedAt ?? null,
    // Ciclo de vida (src/ciclo-de-vida/): classificação do encerramento, abandono,
    // pausa e o chamado aberto a partir da conversa.
    entity_id: s.entityId ?? null,
    close_reason: s.closeReason ?? null,
    close_module_id: s.closeModuleId ?? null,
    close_module_name: s.closeModuleName ?? null,
    close_note: s.closeNote ?? null,
    end_kind: s.endKind ?? null,
    abandon_type: s.abandonType ?? null,
    abandon_label: isAbandonado(s) ? rotuloDoAbandono(s.abandonType) : null,
    paused_at: s.pausedAt ?? null,
    issue_id: s.issueId ?? null,
    issue_project_id: s.issueProjectId ?? null,
    issue_label: s.issueLabel ?? null,
  };
}

export type SessaoSerializada = ReturnType<typeof serializeSession>;

/**
 * A mesma conversa, sem a avaliação do cliente.
 *
 * A pesquisa de satisfação é instrumento de gestão: quem lê é o administrador.
 * Mostrar a nota e o comentário ao atendente que acabou de ser avaliado muda a
 * conversa seguinte — e não é para isso que se pergunta ao cliente.
 */
export function semAvaliacao<T extends SessaoSerializada>(sessao: T): T {
  return { ...sessao, rating_score: null, rating_comment: null };
}

/**
 * Alguém chegou a atender esta conversa?
 *
 * É o que separa "o atendimento acabou" de "não houve atendimento": quem abriu o
 * chat, esperou e desistiu não tem o que avaliar.
 */
export function houveAtendimento(s: { assignedAttendantId?: string | null }): boolean {
  return Boolean(s.assignedAttendantId);
}
