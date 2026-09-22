// Regras puras do token de redefinição de senha. Só o hash (SHA-256) vai para o
// banco: quem lê a tabela não consegue usar o link. O token vale uma vez e expira.

import { createHash, randomBytes } from "crypto";

export type ResetTokenState = "valid" | "invalid" | "expired" | "used";

export type ResetTokenRow = { expiresAt: Date; usedAt: Date | null };

export const RESET_TOKEN_MINUTES = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function generateResetToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function buildResetExpiry(now: Date, minutes: number): Date {
  return new Date(now.getTime() + minutes * 60_000);
}

export function readResetTokenState(row: ResetTokenRow | null, now: Date): ResetTokenState {
  if (!row) return "invalid";
  if (row.usedAt) return "used";
  if (row.expiresAt.getTime() <= now.getTime()) return "expired";
  return "valid";
}

/** O link carrega o id do usuário em base64url (o `uidb64` que a tela já espera). */
export function encodeUid(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}

export function decodeUid(uidb64: string): string | null {
  const decoded = Buffer.from(uidb64, "base64url").toString("utf8");
  return UUID_RE.test(decoded) ? decoded : null;
}
