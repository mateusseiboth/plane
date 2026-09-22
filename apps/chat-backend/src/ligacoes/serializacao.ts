/**
 * A ligação no JSON da API (snake_case, como o resto do chat). Nada aqui lê o
 * banco: a entrada é o registro do Prisma já carregado.
 */

import { withoutAvaliacao, serializeSession } from "@/sessoes";

export function serializeLigacao(l: any) {
  return {
    id: l.id,
    session_id: l.sessionId,
    call_id: l.callId,
    caller: l.caller ?? null,
    extension: l.extension ?? null,
    status: l.status,
    started_at: l.startedAt ?? null,
    ended_at: l.endedAt ?? null,
    duration_sec: l.durationSec ?? null,
    recording_url: l.recordingUrl ?? null,
    descricao: l.descricao ?? null,
    concluded_by_id: l.concludedById ?? null,
    concluded_at: l.concludedAt ?? null,
    ticket_kind: l.ticketKind ?? null,
    ticket_id: l.ticketId ?? null,
    ticket_project_id: l.ticketProjectId ?? null,
    ticket_label: l.ticketLabel ?? null,
    created_at: l.createdAt,
  };
}

export type LigacaoSerializada = ReturnType<typeof serializeLigacao>;

/** Sessão + ligação, sem a avaliação do cliente (ligação não tem pesquisa). */
export const serializeSessaoComLigacao = (s: any) => ({
  session: withoutAvaliacao(serializeSession(s)),
  ligacao: s.ligacao ? serializeLigacao(s.ligacao) : null,
});
