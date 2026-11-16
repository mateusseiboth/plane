/**
 * O motivo da recusa da solicitação, sem React. O servidor exige o mesmo
 * mínimo (`modules/solicitacao/recusa-da-solicitacao.rules.ts`) e manda o
 * motivo para quem abriu.
 */

export const MINIMO_DO_MOTIVO = 10;

const MENSAGEM_SEM_MOTIVO = `Escreva o motivo da recusa com pelo menos ${MINIMO_DO_MOTIVO} caracteres.`;

const MENSAGEM_DE_FALHA = "Não foi possível recusar. Tente de novo.";

type RecusaDoServidor = { detail?: string; errors?: { path: string; message: string }[] } | undefined;

/** O que falta no motivo, ou `undefined` quando ele já serve. */
export const findPendenciaDoMotivo = (motivo: string): string | undefined =>
  motivo.trim().length < MINIMO_DO_MOTIVO ? MENSAGEM_SEM_MOTIVO : undefined;

/** A mensagem que a tela põe no campo quando o servidor recusa. */
export const readErroDoMotivo = (erro: RecusaDoServidor): string =>
  erro?.errors?.find((e) => e.path === "motivo")?.message ?? erro?.detail ?? MENSAGEM_DE_FALHA;
