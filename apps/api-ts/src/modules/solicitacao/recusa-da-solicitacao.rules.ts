/**
 * Regras da decisão da triagem, sem banco: o que é decidir (só quem tem
 * `intake.review`), o motivo obrigatório da recusa e o comentário que leva o
 * motivo para quem abriu.
 */
import { escapeHtml } from "@utils/email-template";
import { createFieldError } from "@utils/field-error";

export const STATUS_RECUSADA = -1;

/** Aceitar (1), recusar (-1), adiar (0) e marcar duplicada (2) decidem o destino do pedido. */
const STATUS_DE_DECISAO = new Set([-1, 0, 1, 2]);

export const MINIMO_DO_MOTIVO = 10;

export const MENSAGEM_SEM_MOTIVO = `Escreva o motivo da recusa com pelo menos ${MINIMO_DO_MOTIVO} caracteres.`;

type CorpoDaTriagem = { status?: unknown; duplicate_to?: unknown; snoozed_till?: unknown; motivo?: unknown };

/** O corpo decide a solicitação? Adiar e marcar duplicada também chegam pelos próprios campos. */
export const isDecisaoDaTriagem = (corpo: CorpoDaTriagem): boolean =>
  STATUS_DE_DECISAO.has(Number(corpo.status)) || corpo.duplicate_to !== undefined || corpo.snoozed_till !== undefined;

export const isRecusa = (corpo: CorpoDaTriagem): boolean => Number(corpo.status) === STATUS_RECUSADA;

/** O motivo da recusa, sem espaços nas pontas; curto demais volta para o campo `motivo`. */
export const readMotivoDaRecusa = (corpo: CorpoDaTriagem): string => {
  const motivo = typeof corpo.motivo === "string" ? corpo.motivo.trim() : "";
  if (motivo.length < MINIMO_DO_MOTIVO) throw createFieldError("motivo", MENSAGEM_SEM_MOTIVO);
  return motivo;
};

/** O comentário que fica no chamado: quem abriu lê o motivo na própria solicitação. */
export const buildComentarioDaRecusa = (motivo: string): { html: string; texto: string } => ({
  html: `<p><strong>Solicitação recusada.</strong></p><p>${escapeHtml(motivo).replace(/\n/g, "<br />")}</p>`,
  texto: `Solicitação recusada. ${motivo}`,
});
