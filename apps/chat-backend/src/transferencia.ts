/**
 * Quem é avisado, pelo socket, quando um atendimento troca de dono.
 *
 *  - quem RECEBE ganha `session.transferred` (toca o alerta e a conversa entra
 *    na lista dele);
 *  - quem ATENDIA e quem TRANSFERIU ganham `session.transferred_out`: a tela
 *    tira a conversa da lista na hora quando a pessoa não administra o chat
 *    (ver `src/visibilidade.ts`).
 *
 * Puro: a rota envia cada aviso com `sendToUser`.
 */

export type AvisoDaTransferencia = { userId: string; payload: Record<string, unknown> };

type Transferencia = {
  sessionId: string;
  clientName: string | null;
  /** Quem atendia antes (nulo quando a conversa estava sem dono). */
  anteriorUserId: string | null;
  /** Quem pediu a transferência. */
  porUserId: string;
  paraUserId: string;
};

export function buildAvisosDaTransferencia(t: Transferencia): AvisoDaTransferencia[] {
  const recebeu: AvisoDaTransferencia = {
    userId: t.paraUserId,
    payload: {
      type: "session.transferred",
      session_id: t.sessionId,
      to_user_id: t.paraUserId,
      client_name: t.clientName,
    },
  };
  const deixaram = [...new Set([t.anteriorUserId, t.porUserId])].filter(
    (userId): userId is string => !!userId && userId !== t.paraUserId
  );
  return [
    recebeu,
    ...deixaram.map((userId) => ({
      userId,
      payload: { type: "session.transferred_out", session_id: t.sessionId, to_user_id: t.paraUserId },
    })),
  ];
}
