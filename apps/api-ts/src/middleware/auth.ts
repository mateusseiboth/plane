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

async function resolveJwt(rawToken: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(rawToken, JWT_SECRET_BYTES);
    if (!payload.sub) return null;
    return prisma.user.findUnique({
      where: { id: payload.sub, isActive: true, deletedAt: null },
      select: { id: true, email: true, displayName: true, isInstanceAdmin: true, isSuperuser: true },
    });
  } catch {
    return null;
  }
}

export const authPlugin = new Elysia({ name: "auth" })
  .derive({ as: "global" }, async (ctx) => {
    // 1. X-Api-Key header
    const apiKey = ctx.headers["x-api-key"];
    if (apiKey) {
      const user = await resolveApiKey(apiKey);
      if (user) return { user };
    }

    // 2. Bearer token from Authorization header
    const authHeader = ctx.headers["authorization"];
    if (authHeader?.startsWith("Bearer ")) {
      const user = await resolveJwt(authHeader.slice(7));
      if (user) return { user };
    }

    // 3. JWT from plane_auth cookie (Elysia built-in cookie access)
    const cookieHeader = ctx.headers["cookie"] ?? "";
    const match = cookieHeader.match(/(?:^|;\s*)plane_auth=([^;]+)/);
    if (match?.[1]) {
      const user = await resolveJwt(decodeURIComponent(match[1]));
      if (user) return { user };
    }

    ctx.set.status = 401;
    throw new Error("Credenciais de autenticação não foram fornecidas.");
  });
