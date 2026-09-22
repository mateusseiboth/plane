// Núcleo do "esqueci minha senha", comum ao usuário do Plane (`user`) e à conta
// do portal do cliente (`portal`): emitir o token, conferir o token e gastá-lo.
// O `kind` separa os dois mundos: token de um nunca vale no outro.

import prisma from "@db";
import type { Prisma } from "@prisma/client";
import {
  RESET_TOKEN_MINUTES,
  buildResetExpiry,
  generateResetToken,
  hashResetToken,
  readResetTokenState,
  type ResetTokenState,
} from "@utils/password-reset";

export const RESET_KINDS = { USER: "user", PORTAL: "portal" } as const;
export type ResetKind = (typeof RESET_KINDS)[keyof typeof RESET_KINDS];

/** Grava o hash de um token novo e devolve o token em claro (só vai no link). */
export async function issueResetToken(kind: ResetKind, subjectId: string, requestIp: string | null): Promise<string> {
  const token = generateResetToken();
  await prisma.passwordResetToken.create({
    data: {
      kind,
      subjectId,
      tokenHash: hashResetToken(token),
      expiresAt: buildResetExpiry(new Date(), RESET_TOKEN_MINUTES),
      requestIp,
    },
  });
  return token;
}

/** Situação do token para este alvo: válido, usado, vencido ou inexistente. */
export async function readResetState(
  kind: ResetKind,
  subjectId: string | null,
  token: string
): Promise<ResetTokenState> {
  if (!subjectId || !token) return "invalid";
  const row = await prisma.passwordResetToken.findFirst({
    where: { kind, subjectId, tokenHash: hashResetToken(token) },
  });
  return readResetTokenState(row, new Date());
}

/** Na troca, todos os links pendentes do alvo deixam de valer. */
export function consumeResetTokens(tx: Prisma.TransactionClient, kind: ResetKind, subjectId: string, now: Date) {
  return tx.passwordResetToken.updateMany({ where: { kind, subjectId, usedAt: null }, data: { usedAt: now } });
}
