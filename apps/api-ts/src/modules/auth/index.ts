import Elysia from "elysia";
import { SignJWT, jwtVerify } from "jose";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";

const JWT_SECRET_BYTES = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "plane-jwt-secret-change-in-production"
);
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

async function signToken(sub: string, email: string): Promise<string> {
  return new SignJWT({ sub, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET_BYTES);
}

function setCookieHeader(token: string): string {
  return `plane_auth=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
}

function clearCookieHeader(): string {
  return `plane_auth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

// ── Auth routes (public — no authPlugin) ──────────────────────────────────────
export const sessionAuthModule = new Elysia()

  .post("/auth/sign-up/", async ({ body, set }) => {
    const b = body as any;
    if (!b.email || !b.password) {
      set.status = 400;
      return { detail: "email and password are required." };
    }

    const email = b.email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      set.status = 400;
      return { detail: "A user with this email already exists." };
    }

    const hash = await Bun.password.hash(b.password, { algorithm: "bcrypt", cost: 12 });
    const user = await prisma.user.create({
      data: {
        email,
        password: hash,
        firstName: b.first_name ?? "",
        lastName: b.last_name ?? "",
        displayName: b.display_name ?? email.split("@")[0],
        username: `user_${Date.now()}`,
        isEmailVerified: true,
      },
    });

    const token = await signToken(user.id, user.email);
    set.status = 201;
    set.headers["Set-Cookie"] = setCookieHeader(token);
    return {
      id: user.id, email: user.email, display_name: user.displayName,
      is_superuser: user.isSuperuser, is_instance_admin: user.isInstanceAdmin, token,
    };
  })

  .post("/auth/sign-in/", async ({ body, set }) => {
    const b = body as any;
    if (!b.email || !b.password) {
      set.status = 400;
      return { detail: "email and password are required." };
    }

    const email = b.email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.password) { set.status = 403; return { detail: "Invalid email or password." }; }
    if (!user.isActive)  { set.status = 403; return { detail: "This account is deactivated." }; }

    const valid = await Bun.password.verify(b.password, user.password);
    if (!valid) { set.status = 403; return { detail: "Invalid email or password." }; }

    const token = await signToken(user.id, user.email);
    set.headers["Set-Cookie"] = setCookieHeader(token);
    return {
      id: user.id, email: user.email, display_name: user.displayName,
      first_name: user.firstName, last_name: user.lastName,
      is_superuser: user.isSuperuser, is_instance_admin: user.isInstanceAdmin, token,
    };
  })

  .post("/auth/sign-out/", ({ set }) => {
    set.headers["Set-Cookie"] = clearCookieHeader();
    set.status = 204;
    return null;
  })

  .post("/auth/token/refresh/", async ({ body, headers, set }) => {
    const b = body as any;
    const cookieHeader = headers["cookie"] ?? "";
    const match = cookieHeader.match(/(?:^|;\s*)plane_auth=([^;]+)/);
    const rawToken = b?.refresh_token ?? (match?.[1] ? decodeURIComponent(match[1]) : null);
    if (!rawToken) { set.status = 401; return { detail: "No token provided." }; }

    try {
      const { payload } = await jwtVerify(rawToken, JWT_SECRET_BYTES);
      if (!payload.sub) { set.status = 401; return { detail: "Invalid token." }; }

      const user = await prisma.user.findUnique({ where: { id: payload.sub as string } });
      if (!user?.isActive) { set.status = 401; return { detail: "User inactive." }; }

      const newToken = await signToken(user.id, user.email);
      set.headers["Set-Cookie"] = setCookieHeader(newToken);
      return { token: newToken, access: newToken };
    } catch {
      set.status = 401;
      return { detail: "Invalid or expired token." };
    }
  })

  .get("/auth/me/", async ({ headers, set }) => {
    const cookieHeader = headers["cookie"] ?? "";
    const match = cookieHeader.match(/(?:^|;\s*)plane_auth=([^;]+)/);
    const rawToken =
      headers["authorization"]?.replace("Bearer ", "") ??
      (match?.[1] ? decodeURIComponent(match[1]) : null);

    if (!rawToken) { set.status = 401; return { detail: "Not authenticated." }; }

    try {
      const { payload } = await jwtVerify(rawToken, JWT_SECRET_BYTES);
      if (!payload.sub) { set.status = 401; return { detail: "Invalid token." }; }

      const user = await prisma.user.findUnique({
        where: { id: payload.sub as string },
        select: {
          id: true, email: true, firstName: true, lastName: true, displayName: true,
          avatar: true, userTimezone: true, isActive: true, isSuperuser: true,
          isStaff: true, isInstanceAdmin: true, dateJoined: true,
        },
      });
      if (!user) { set.status = 401; return { detail: "User not found." }; }
      return user;
    } catch {
      set.status = 401;
      return { detail: "Invalid or expired token." };
    }
  })

  .get("/auth/instance/", async ({ headers, set }) => {
    const cookieHeader = headers["cookie"] ?? "";
    const match = cookieHeader.match(/(?:^|;\s*)plane_auth=([^;]+)/);
    const rawToken =
      headers["authorization"]?.replace("Bearer ", "") ??
      (match?.[1] ? decodeURIComponent(match[1]) : null);

    if (!rawToken) { set.status = 401; return { detail: "Not authenticated." }; }

    try {
      const { payload } = await jwtVerify(rawToken, JWT_SECRET_BYTES);
      if (!payload.sub) { set.status = 401; return { detail: "Invalid token." }; }

      const user = await prisma.user.findUnique({
        where: { id: payload.sub as string },
        select: { id: true, email: true, displayName: true, isInstanceAdmin: true, isSuperuser: true },
      });
      if (!user || (!user.isInstanceAdmin && !user.isSuperuser)) {
        set.status = 403;
        return { detail: "Instance admin access required." };
      }
      return { is_instance_admin: user.isInstanceAdmin, is_superuser: user.isSuperuser, user };
    } catch {
      set.status = 401;
      return { detail: "Invalid or expired token." };
    }
  });

// ── API Token management (requires API key or JWT auth) ───────────────────────
export const authModule = new Elysia()
  .use(sessionAuthModule)
  .use(authPlugin)

  .get("/users/api-tokens/", async ({ user, query }) => {
    return paginate({
      query: (skip, take) =>
        prisma.apiToken.findMany({
          where: { userId: user.id }, skip, take,
          select: { id: true, label: true, description: true, isActive: true, expiredAt: true, lastUsed: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        }),
      count: () => prisma.apiToken.count({ where: { userId: user.id } }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/users/api-tokens/", async ({ body, user, set }) => {
    const b = body as any;
    const token = await prisma.apiToken.create({
      data: {
        userId: user.id,
        label: b.label ?? "API Token",
        description: b.description ?? "",
        expiredAt: b.expired_at ? new Date(b.expired_at) : null,
        token: `plane_${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`,
        isActive: true,
      },
    });
    set.status = 201;
    return token;
  })

  .get("/users/api-tokens/:token_id/", async ({ params: { token_id }, user, set }) => {
    const token = await prisma.apiToken.findFirst({ where: { id: token_id, userId: user.id } });
    if (!token) { set.status = 404; return { detail: "Token not found." }; }
    return token;
  })

  .patch("/users/api-tokens/:token_id/", async ({ params: { token_id }, body, user, set }) => {
    const token = await prisma.apiToken.findFirst({ where: { id: token_id, userId: user.id } });
    if (!token) { set.status = 404; return { detail: "Token not found." }; }
    const b = body as any;
    const data: any = {};
    if (b.label !== undefined) data.label = b.label;
    if (b.description !== undefined) data.description = b.description;
    if (b.is_active !== undefined) data.isActive = b.is_active;
    if (b.expired_at !== undefined) data.expiredAt = b.expired_at ? new Date(b.expired_at) : null;
    return prisma.apiToken.update({ where: { id: token_id }, data });
  })

  .delete("/users/api-tokens/:token_id/", async ({ params: { token_id }, user, set }) => {
    const token = await prisma.apiToken.findFirst({ where: { id: token_id, userId: user.id } });
    if (!token) { set.status = 404; return { detail: "Token not found." }; }
    await prisma.apiToken.delete({ where: { id: token_id } });
    set.status = 204;
    return null;
  });
