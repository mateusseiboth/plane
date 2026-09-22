// "Esqueci minha senha" do usuário do Plane: pede o link por e-mail e troca a
// senha com o token do link. O token vale uma vez, expira e só o hash fica
// gravado. Trocar a senha derruba todas as sessões abertas.

import prisma from "@db";
import { readAppBaseUrl, sendEmail } from "@utils/email";
import {
  RESET_TOKEN_MINUTES,
  buildResetExpiry,
  decodeUid,
  encodeUid,
  generateResetToken,
  hashResetToken,
  readResetTokenState,
  type ResetTokenState,
} from "@utils/password-reset";

const RESET_KIND = "user";
const BCRYPT = { algorithm: "bcrypt", cost: 12 } as const;
export const MIN_PASSWORD_LENGTH = 8;

// Códigos que a tela de redefinição já entende (packages/constants, EAuthErrorCodes).
export const RESET_ERROR_CODES = {
  INVALID_PASSWORD: "5020",
  PASSWORD_TOO_WEAK: "5021",
  INVALID_PASSWORD_TOKEN: "5125",
  EXPIRED_PASSWORD_TOKEN: "5130",
} as const;

export type ResetErrorCode = (typeof RESET_ERROR_CODES)[keyof typeof RESET_ERROR_CODES];

export type ResetOutcome = { ok: true; userId: string } | { ok: false; errorCode: ResetErrorCode };

const TOKEN_STATE_ERRORS: Record<Exclude<ResetTokenState, "valid">, ResetErrorCode> = {
  invalid: RESET_ERROR_CODES.INVALID_PASSWORD_TOKEN,
  used: RESET_ERROR_CODES.INVALID_PASSWORD_TOKEN,
  expired: RESET_ERROR_CODES.EXPIRED_PASSWORD_TOKEN,
};

export function buildResetUrl(userId: string, token: string, email: string): string {
  const params = new URLSearchParams({ uidb64: encodeUid(userId), token, email });
  return `${readAppBaseUrl()}/accounts/reset-password?${params.toString()}`;
}

async function sendResetEmail(user: { id: string; email: string; firstName: string }, token: string) {
  await sendEmail(user.email, {
    subject: "Redefinição de senha",
    title: user.firstName ? `Olá, ${user.firstName}` : "Olá",
    paragraphs: [
      "Recebemos um pedido para criar uma nova senha para a sua conta.",
      `O link vale por ${RESET_TOKEN_MINUTES} minutos e pode ser usado uma única vez.`,
      "Se você não pediu, ignore esta mensagem. A senha atual continua valendo.",
    ],
    action: { label: "Criar nova senha", url: buildResetUrl(user.id, token, user.email) },
  });
}

/**
 * Gera o token e envia o link. E-mail desconhecido, conta inativa ou congelada
 * não recebem nada, e quem chamou não fica sabendo: a resposta é sempre a mesma.
 */
export async function requestPasswordReset(email: string, requestIp: string | null): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase().trim(), isActive: true, deletedAt: null },
    select: { id: true, email: true, firstName: true },
  });
  if (!user) return;
  const token = generateResetToken();
  await prisma.passwordResetToken.create({
    data: {
      kind: RESET_KIND,
      subjectId: user.id,
      tokenHash: hashResetToken(token),
      expiresAt: buildResetExpiry(new Date(), RESET_TOKEN_MINUTES),
      requestIp,
    },
  });
  await sendResetEmail(user, token);
}

function readPasswordError(password: unknown): ResetErrorCode | null {
  if (typeof password !== "string" || !password) return RESET_ERROR_CODES.INVALID_PASSWORD;
  if (password.length < MIN_PASSWORD_LENGTH) return RESET_ERROR_CODES.PASSWORD_TOO_WEAK;
  return null;
}

async function findTokenRow(userId: string | null, token: string) {
  if (!userId) return null;
  return prisma.passwordResetToken.findFirst({
    where: { kind: RESET_KIND, subjectId: userId, tokenHash: hashResetToken(token) },
  });
}

/**
 * Troca a senha com o token do link. Senha fraca não gasta o token: a pessoa
 * volta para a tela e tenta outra. Na troca, todos os links pendentes do
 * usuário deixam de valer e todas as sessões caem.
 */
export async function applyPasswordReset(uidb64: string, token: string, password: unknown): Promise<ResetOutcome> {
  const userId = decodeUid(uidb64);
  const row = await findTokenRow(userId, token);
  const state = readResetTokenState(row, new Date());
  if (state !== "valid") return { ok: false, errorCode: TOKEN_STATE_ERRORS[state] };

  const passwordError = readPasswordError(password);
  if (passwordError) return { ok: false, errorCode: passwordError };

  const hash = await Bun.password.hash(password as string, BCRYPT);
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId as string },
      data: { password: hash, isPasswordAutoset: false, tokenUpdatedAt: now },
    }),
    prisma.passwordResetToken.updateMany({
      where: { kind: RESET_KIND, subjectId: userId as string, usedAt: null },
      data: { usedAt: now },
    }),
  ]);
  return { ok: true, userId: userId as string };
}
