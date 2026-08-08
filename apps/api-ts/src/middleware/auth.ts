import Elysia from "elysia";
import { jwtVerify } from "jose";
import prisma from "@db";

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  isInstanceAdmin: boolean;
  isSuperuser: boolean;
};

const JWT_SECRET_BYTES = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "plane-jwt-secret-change-in-production"
);

async function resolveApiKey(apiKey: string): Promise<AuthUser | null> {
  const token = await prisma.apiToken.findUnique({
    where: { token: apiKey, isActive: true },
    include: {
      user: {
        select: { id: true, email: true, displayName: true, isInstanceAdmin: true, isSuperuser: true },
      },
    },
  });
  if (!token) return null;
  if (token.expiredAt && token.expiredAt < new Date()) return null;
  prisma.apiToken
    .update({ where: { id: token.id }, data: { lastUsed: new Date() } })
    .catch(() => {});
  return token.user;
}

/**
 * Falha temporária de infraestrutura (banco fora do ar, pool esgotado).
 * Precisa de um tipo próprio porque um `catch` genérico aqui transformava
 * indisponibilidade em 401: para o usuário isso aparecia como logout aleatório,
 * e o front ainda limpava a sessão. Token inválido é 401; banco fora é 503.
 */
class AuthUnavailableError extends Error {}

/** Só a verificação criptográfica; `null` = token ausente, expirado ou adulterado. */
async function verifiedSubject(rawToken: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(rawToken, JWT_SECRET_BYTES);
    return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

async function resolveJwt(rawToken: string): Promise<AuthUser | null> {
  const sub = await verifiedSubject(rawToken);
  if (!sub) return null;
  // Fora do try: erro de banco NÃO pode virar "credencial inválida".
  return prisma.user.findUnique({
    where: { id: sub, isActive: true, deletedAt: null },
    select: { id: true, email: true, displayName: true, isInstanceAdmin: true, isSuperuser: true },
  });
}

/** Executa uma tentativa de autenticação convertendo falha de banco em 503. */
async function tentar(resolver: () => Promise<AuthUser | null>): Promise<AuthUser | null> {
  try {
    return await resolver();
  } catch (error) {
    throw new AuthUnavailableError("Serviço de autenticação indisponível. Tente novamente.", { cause: error });
  }
}

export const authPlugin = new Elysia({ name: "auth" })
  .derive({ as: "global" }, async (ctx) => {
    const tentativas: Array<() => Promise<AuthUser | null>> = [];

    // 1. X-Api-Key header
    const apiKey = ctx.headers["x-api-key"];
    if (apiKey) tentativas.push(() => resolveApiKey(apiKey));

    // 2. Bearer token from Authorization header
    const authHeader = ctx.headers["authorization"];
    if (authHeader?.startsWith("Bearer ")) tentativas.push(() => resolveJwt(authHeader.slice(7)));

    // 3. JWT from plane_auth cookie (Elysia built-in cookie access)
    const match = (ctx.headers["cookie"] ?? "").match(/(?:^|;\s*)plane_auth=([^;]+)/);
    if (match?.[1]) tentativas.push(() => resolveJwt(decodeURIComponent(match[1])));

    try {
      for (const tentativa of tentativas) {
        const user = await tentar(tentativa);
        if (user) return { user };
      }
    } catch (error) {
      if (!(error instanceof AuthUnavailableError)) throw error;
      console.error("[auth] falha ao resolver credencial:", error.cause);
      ctx.set.status = 503;
      throw new Error(error.message);
    }

    ctx.set.status = 401;
    throw new Error("Credenciais de autenticação não foram fornecidas.");
  });
