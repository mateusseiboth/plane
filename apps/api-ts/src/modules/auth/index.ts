import Elysia from "elysia";
import { SignJWT, jwtVerify } from "jose";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";

const JWT_SECRET_BYTES = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "plane-jwt-secret-change-in-production"
);
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

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

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function resolveTokenFromRequest(headers: Record<string, string | undefined>): Promise<{ sub: string; email: string } | null> {
  const cookieHeader = headers["cookie"] ?? "";
  const match = cookieHeader.match(/(?:^|;\s*)plane_auth=([^;]+)/);
  const rawToken =
    headers["authorization"]?.replace("Bearer ", "") ??
    (match?.[1] ? decodeURIComponent(match[1]) : null);
  if (!rawToken) return null;
  try {
    const { payload } = await jwtVerify(rawToken, JWT_SECRET_BYTES);
    if (!payload.sub) return null;
    return { sub: payload.sub as string, email: payload.email as string };
  } catch {
    return null;
  }
}

// ── Shared email-check logic ───────────────────────────────────────────────────
async function emailCheck(email: string, set: any) {
  if (!email) {
    set.status = 400;
    return { error_code: 4030, error_message: "EMAIL_REQUIRED" };
  }
  const normalized = String(email).toLowerCase().trim();
  if (!validateEmail(normalized)) {
    set.status = 400;
    return { error_code: 4031, error_message: "INVALID_EMAIL" };
  }

  const instance = await prisma.instance.findFirst();
  if (!instance?.isSetupDone) {
    set.status = 400;
    return { error_code: 4035, error_message: "INSTANCE_NOT_CONFIGURED" };
  }

  const existingUser = await prisma.user.findUnique({ where: { email: normalized } });
  if (existingUser) {
    return { existing: true, status: "CREDENTIAL" };
  }
  return { existing: false, status: "CREDENTIAL" };
}

// ── Shared sign-in logic ───────────────────────────────────────────────────────
async function signIn(b: any, set: any) {
  if (!b.email || !b.password) {
    set.status = 400;
    return { detail: "email and password are required." };
  }
  const email = b.email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.password) { set.status = 403; return { detail: "Invalid email or password." }; }
  if (!user.isActive) { set.status = 403; return { detail: "This account is deactivated." }; }

  const valid = await Bun.password.verify(b.password, user.password);
  if (!valid) { set.status = 403; return { detail: "Invalid email or password." }; }

  const token = await signToken(user.id, user.email);
  set.headers["Set-Cookie"] = setCookieHeader(token);
  return {
    id: user.id, email: user.email, display_name: user.displayName,
    first_name: user.firstName, last_name: user.lastName,
    is_superuser: user.isSuperuser, is_instance_admin: user.isInstanceAdmin, token,
  };
}

// ── Shared sign-up logic ───────────────────────────────────────────────────────
async function signUp(b: any, set: any) {
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
      email, password: hash,
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
}

// ── Public auth routes ─────────────────────────────────────────────────────────
export const sessionAuthModule = new Elysia()

  // ── Email check (determines credential vs magic link) ────────────────────────
  .post("/auth/email-check/", async ({ body, set }) => emailCheck((body as any)?.email, set))
  .post("/auth/spaces/email-check/", async ({ body, set }) => emailCheck((body as any)?.email, set))

  // ── Sign-in / sign-up / sign-out ─────────────────────────────────────────────
  .post("/auth/sign-in/", async ({ body, set }) => signIn(body, set))
  .post("/auth/sign-up/", async ({ body, set }) => signUp(body, set))
  .post("/auth/sign-out/", ({ set }) => {
    set.headers["Set-Cookie"] = clearCookieHeader();
    set.status = 204;
    return null;
  })

  // Spaces variants (same logic, different path prefix used by the spaces app)
  .post("/auth/spaces/sign-in/", async ({ body, set }) => signIn(body, set))
  .post("/auth/spaces/sign-up/", async ({ body, set }) => signUp(body, set))
  .post("/auth/spaces/sign-out/", ({ set }) => {
    set.headers["Set-Cookie"] = clearCookieHeader();
    set.status = 204;
    return null;
  })

  // ── CSRF token (not needed for JWT but frontend may call it) ─────────────────
  .get("/auth/get-csrf-token/", () => ({ csrf_token: "" }))

  // ── Token refresh ────────────────────────────────────────────────────────────
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

  // ── Password management ──────────────────────────────────────────────────────
  .post("/auth/forgot-password/", async ({ body, set }) => {
    // SMTP not configured; instruct user to use admin
    set.status = 400;
    return { error_code: 5007, error_message: "SMTP_NOT_CONFIGURED", detail: "Email is not configured. Contact your administrator." };
  })
  .post("/auth/spaces/forgot-password/", async ({ body, set }) => {
    set.status = 400;
    return { error_code: 5007, error_message: "SMTP_NOT_CONFIGURED", detail: "Email is not configured. Contact your administrator." };
  })
  .post("/auth/reset-password/:uidb64/:token/", async ({ params, body, set }) => {
    set.status = 400;
    return { detail: "Password reset via email is not available. Contact your administrator." };
  })
  .post("/auth/spaces/reset-password/:uidb64/:token/", async ({ params, body, set }) => {
    set.status = 400;
    return { detail: "Password reset via email is not available. Contact your administrator." };
  })
  .post("/auth/set-password/", async ({ body, headers, set }) => {
    const resolved = await resolveTokenFromRequest(headers as any);
    if (!resolved) { set.status = 401; return { detail: "Not authenticated." }; }
    const b = body as any;
    if (!b.password) { set.status = 400; return { detail: "password is required." }; }
    const hash = await Bun.password.hash(b.password, { algorithm: "bcrypt", cost: 12 });
    await prisma.user.update({
      where: { id: resolved.sub },
      data: { password: hash, isPasswordAutoset: false },
    });
    return { detail: "Password set successfully." };
  })
  .post("/auth/change-password/", async ({ body, headers, set }) => {
    const resolved = await resolveTokenFromRequest(headers as any);
    if (!resolved) { set.status = 401; return { detail: "Not authenticated." }; }
    const b = body as any;
    if (!b.old_password || !b.new_password) {
      set.status = 400;
      return { detail: "old_password and new_password are required." };
    }
    const user = await prisma.user.findUnique({ where: { id: resolved.sub } });
    if (!user?.password) { set.status = 400; return { detail: "No password set. Use set-password." }; }
    const valid = await Bun.password.verify(b.old_password, user.password);
    if (!valid) { set.status = 400; return { detail: "Old password is incorrect." }; }
    const hash = await Bun.password.hash(b.new_password, { algorithm: "bcrypt", cost: 12 });
    await prisma.user.update({ where: { id: user.id }, data: { password: hash } });
    return { detail: "Password changed successfully." };
  })

  // ── Magic link stubs (SMTP required — not configured) ───────────────────────
  .post("/auth/magic-generate/", ({ set }) => {
    set.status = 400;
    return { error_code: 5007, error_message: "SMTP_NOT_CONFIGURED", detail: "Email is not configured." };
  })
  .post("/auth/magic-sign-in/", ({ set }) => {
    set.status = 400;
    return { error_code: 5007, error_message: "SMTP_NOT_CONFIGURED", detail: "Email is not configured." };
  })
  .post("/auth/magic-sign-up/", ({ set }) => {
    set.status = 400;
    return { error_code: 5007, error_message: "SMTP_NOT_CONFIGURED", detail: "Email is not configured." };
  })
  .post("/auth/spaces/magic-generate/", ({ set }) => {
    set.status = 400;
    return { error_code: 5007, error_message: "SMTP_NOT_CONFIGURED", detail: "Email is not configured." };
  })
  .post("/auth/spaces/magic-sign-in/", ({ set }) => {
    set.status = 400;
    return { error_code: 5007, error_message: "SMTP_NOT_CONFIGURED", detail: "Email is not configured." };
  })
  .post("/auth/spaces/magic-sign-up/", ({ set }) => {
    set.status = 400;
    return { error_code: 5007, error_message: "SMTP_NOT_CONFIGURED", detail: "Email is not configured." };
  })

  // ── OAuth stubs (not configured) ─────────────────────────────────────────────
  .get("/auth/gitlab/", ({ set }) => { set.status = 400; return { detail: "GitLab OAuth not configured." }; })
  .get("/auth/gitlab/callback/", ({ set }) => { set.status = 400; return { detail: "GitLab OAuth not configured." }; })
  .get("/auth/spaces/gitlab/", ({ set }) => { set.status = 400; return { detail: "GitLab OAuth not configured." }; })
  .get("/auth/spaces/gitlab/callback/", ({ set }) => { set.status = 400; return { detail: "GitLab OAuth not configured." }; })
  .get("/auth/github/", ({ set }) => { set.status = 400; return { detail: "GitHub OAuth not configured." }; })
  .get("/auth/github/callback/", ({ set }) => { set.status = 400; return { detail: "GitHub OAuth not configured." }; })
  .get("/auth/spaces/github/", ({ set }) => { set.status = 400; return { detail: "GitHub OAuth not configured." }; })
  .get("/auth/spaces/github/callback/", ({ set }) => { set.status = 400; return { detail: "GitHub OAuth not configured." }; })
  .get("/auth/google/", ({ set }) => { set.status = 400; return { detail: "Google OAuth not configured." }; })
  .get("/auth/google/callback/", ({ set }) => { set.status = 400; return { detail: "Google OAuth not configured." }; })
  .get("/auth/spaces/google/", ({ set }) => { set.status = 400; return { detail: "Google OAuth not configured." }; })
  .get("/auth/spaces/google/callback/", ({ set }) => { set.status = 400; return { detail: "Google OAuth not configured." }; })
  .get("/auth/gitea/", ({ set }) => { set.status = 400; return { detail: "Gitea OAuth not configured." }; })
  .get("/auth/gitea/callback/", ({ set }) => { set.status = 400; return { detail: "Gitea OAuth not configured." }; })
  .get("/auth/spaces/gitea/", ({ set }) => { set.status = 400; return { detail: "Gitea OAuth not configured." }; })
  .get("/auth/spaces/gitea/callback/", ({ set }) => { set.status = 400; return { detail: "Gitea OAuth not configured." }; })

  // ── Me / session endpoints ────────────────────────────────────────────────────
  .get("/auth/me/", async ({ headers, set }) => {
    const resolved = await resolveTokenFromRequest(headers as any);
    if (!resolved) { set.status = 401; return { detail: "Not authenticated." }; }
    const user = await prisma.user.findUnique({
      where: { id: resolved.sub },
      select: {
        id: true, email: true, firstName: true, lastName: true, displayName: true,
        avatar: true, userTimezone: true, isActive: true, isSuperuser: true,
        isStaff: true, isInstanceAdmin: true, dateJoined: true,
      },
    });
    if (!user) { set.status = 401; return { detail: "User not found." }; }
    return user;
  })

  .get("/auth/instance/", async ({ headers, set }) => {
    const resolved = await resolveTokenFromRequest(headers as any);
    if (!resolved) { set.status = 401; return { detail: "Not authenticated." }; }
    const user = await prisma.user.findUnique({
      where: { id: resolved.sub },
      select: { id: true, email: true, displayName: true, isInstanceAdmin: true, isSuperuser: true },
    });
    if (!user || (!user.isInstanceAdmin && !user.isSuperuser)) {
      set.status = 403;
      return { detail: "Instance admin access required." };
    }
    return { is_instance_admin: user.isInstanceAdmin, is_superuser: user.isSuperuser, user };
  });

// ── API Token management (requires auth) ─────────────────────────────────────
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
