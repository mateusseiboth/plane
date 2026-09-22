// Sessão do usuário do Plane. O JWT leva `tv` (token version): o valor de
// `users.token_updated_at` em milissegundos no momento da emissão. Quando o
// marco do usuário muda (senha trocada ou redefinida, usuário congelado, "sair
// de todos os lugares"), todo token emitido antes deixa de valer.
//
// A comparação é exata, e não por `iat`: `iat` tem resolução de segundo, e uma
// revogação no mesmo segundo do login deixaria o token antigo passar.

import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import prisma from "@db";

export const JWT_SECRET_BYTES = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "plane-jwt-secret-change-in-production"
);

export const SESSION_TTL = "7d";

export type SessionSubject = { id: string; email: string; tokenUpdatedAt: Date | null };

export function readSessionVersion(payload: JWTPayload): unknown {
  return payload.tv;
}

export function isSessionRevoked(tokenVersion: unknown, tokenUpdatedAt: Date | null | undefined): boolean {
  if (!tokenUpdatedAt) return false;
  return tokenVersion !== tokenUpdatedAt.getTime();
}

export async function signSessionToken(subject: SessionSubject): Promise<string> {
  return new SignJWT({ sub: subject.id, email: subject.email, tv: subject.tokenUpdatedAt?.getTime() ?? 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(JWT_SECRET_BYTES);
}

/** Só a verificação criptográfica; `null` = token ausente, expirado ou adulterado. */
export async function readSessionClaims(rawToken: string | null | undefined): Promise<JWTPayload | null> {
  if (!rawToken) return null;
  try {
    const { payload } = await jwtVerify(rawToken, JWT_SECRET_BYTES);
    return typeof payload.sub === "string" && payload.sub ? payload : null;
  } catch {
    return null;
  }
}

/** Token do cabeçalho Authorization ou, na falta dele, do cookie `plane_auth`. */
export function readRawSessionToken(headers: Record<string, string | undefined>): string | null {
  const bearer = headers["authorization"];
  if (bearer?.startsWith("Bearer ")) return bearer.slice(7);
  const match = (headers["cookie"] ?? "").match(/(?:^|;\s*)plane_auth=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/**
 * O usuário dono de uma sessão ainda válida: token íntegro, usuário ativo e
 * sessão não revogada. `null` em qualquer outro caso.
 */
export async function findSessionUser(rawToken: string | null | undefined) {
  const claims = await readSessionClaims(rawToken);
  if (!claims) return null;
  const user = await prisma.user.findFirst({ where: { id: String(claims.sub), isActive: true, deletedAt: null } });
  if (!user || isSessionRevoked(readSessionVersion(claims), user.tokenUpdatedAt)) return null;
  return user;
}

/**
 * Invalida todas as sessões do usuário a partir de agora. Devolve o usuário com
 * o marco novo, para quem quiser emitir em seguida o token da sessão atual.
 */
export function revokeUserSessions(userId: string, data: Record<string, unknown> = {}) {
  return prisma.user.update({
    where: { id: userId },
    data: { ...data, tokenUpdatedAt: new Date() },
    select: { id: true, email: true, tokenUpdatedAt: true },
  });
}
