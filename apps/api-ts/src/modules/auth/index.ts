import { Elysia } from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { applyPasswordReset, requestPasswordReset } from "@modules/auth/password-reset";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, recordAudit } from "@utils/audit";
import { isEmailEnabled } from "@utils/email";
import { paginate } from "@utils/pagination";
import { checkRateLimit } from "@utils/rate-limiter";
import { findSessionUser, readRawSessionToken, revokeUserSessions, signSessionToken } from "@utils/session";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const BCRYPT = { algorithm: "bcrypt", cost: 12 } as const;

function setCookieHeader(token: string): string {
  return `plane_auth=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
}

function clearCookieHeader(): string {
  return `plane_auth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Sessão válida (token íntegro, usuário ativo e sessão não revogada) ou `null`. */
async function resolveTokenFromRequest(
  headers: Record<string, string | undefined>
): Promise<{ sub: string; email: string } | null> {
  const user = await findSessionUser(readRawSessionToken(headers));
  return user ? { sub: user.id, email: user.email } : null;
}

/** Troca o marco de sessão do usuário e devolve o cookie da sessão atual, já no marco novo. */
async function renewSessionCookie(userId: string, set: any, data: Record<string, unknown> = {}) {
  const renewed = await revokeUserSessions(userId, data);
  set.headers["Set-Cookie"] = setCookieHeader(await signSessionToken(renewed));
}

function readClientIp(headers: Record<string, string | undefined>): string | null {
  return headers["x-forwarded-for"]?.split(",")[0]?.trim() || headers["x-real-ip"] || null;
}

const FORGOT_PASSWORD_DETAIL = "Se o e-mail estiver cadastrado, você vai receber o link para criar uma nova senha.";

/**
 * Pedido de link de redefinição. A resposta é a mesma para e-mail cadastrado ou
 * não: dizer qual existe entregaria a lista de usuários a quem tentasse adivinhar.
 */
async function forgotPassword(body: any, headers: Record<string, string | undefined>, set: any) {
  const email = String(body?.email ?? "")
    .toLowerCase()
    .trim();
  if (!validateEmail(email)) {
    set.status = 400;
    return { detail: "Informe um e-mail válido.", errors: [{ path: "email", message: "Informe um e-mail válido." }] };
  }
  const ip = readClientIp(headers);
  if (!checkRateLimit(`forgot-password:${ip ?? "?"}`, 10) || !checkRateLimit(`forgot-password:${email}`, 5)) {
    set.status = 429;
    return { detail: "Muitos pedidos seguidos. Aguarde um minuto e tente de novo." };
  }
  if (!(await isEmailEnabled())) {
    set.status = 400;
    return {
      error_code: 5007,
      error_message: "SMTP_NOT_CONFIGURED",
      detail: "O envio de e-mail não está configurado. Fale com o administrador.",
    };
  }
  try {
    await requestPasswordReset(email, ip);
  } catch (e) {
    // Falha de SMTP não muda a resposta: ela diria que o e-mail existe.
    console.error("[forgot-password] falha ao enviar o link:", e);
  }
  return { detail: FORGOT_PASSWORD_DETAIL };
}

/** Formulário de nova senha (POST de navegador): sempre responde com redirecionamento. */
async function resetPassword(params: { uidb64: string; token: string }, body: any, set: any, headers: any) {
  const outcome = await applyPasswordReset(params.uidb64, params.token, body?.password);
  if (outcome.ok) {
    const user = await prisma.user.findUnique({ where: { id: outcome.userId }, select: { id: true, email: true } });
    auditAuth(AUDIT_ACTIONS.PASSWORD_CHANGE, user?.email ?? "", headers, user, { por_email: true });
    return authRedirect(set, "/?success=true");
  }
  const back = new URLSearchParams({
    uidb64: params.uidb64,
    token: params.token,
    email: String(body?.email ?? ""),
    error_code: outcome.errorCode,
  });
  return authRedirect(set, `/accounts/reset-password?${back.toString()}`);
}

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,60}$/;

type LoginLookup = { isValid: (identifier: string) => boolean; where: (identifier: string) => object };

// Quem digita com @ entra pelo e-mail; sem @, pelo nome de usuário.
const LOGIN_LOOKUPS: Record<"email" | "username", LoginLookup> = {
  email: { isValid: validateEmail, where: (email) => ({ email }) },
  username: {
    isValid: (username) => USERNAME_RE.test(username),
    where: (username) => ({ username: { equals: username, mode: "insensitive" } }),
  },
};

function readLoginLookup(identifier: string): LoginLookup {
  return LOGIN_LOOKUPS[identifier.includes("@") ? "email" : "username"];
}

function normalizeLogin(identifier: unknown): string {
  const text = String(identifier ?? "").trim();
  return text.includes("@") ? text.toLowerCase() : text;
}

/** Usuário pelo e-mail ou pelo nome de usuário; `null` quando o formato não serve. */
async function findUserByLogin(identifier: string) {
  const lookup = readLoginLookup(identifier);
  if (!lookup.isValid(identifier)) return null;
  return prisma.user.findFirst({ where: { ...lookup.where(identifier), deletedAt: null } });
}

// ── Shared email-check logic ───────────────────────────────────────────────────
async function emailCheck(email: string, set: any) {
  if (!email) {
    set.status = 400;
    return { error_code: 4030, error_message: "EMAIL_REQUIRED" };
  }
  const normalized = normalizeLogin(email);
  if (!readLoginLookup(normalized).isValid(normalized)) {
    set.status = 400;
    return { error_code: 4031, error_message: "INVALID_EMAIL" };
  }

  const instance = await prisma.instance.findFirst();
  if (!instance?.isSetupDone) {
    set.status = 400;
    return { error_code: 4035, error_message: "INSTANCE_NOT_CONFIGURED" };
  }

  // Check if email/password auth is enabled (stored as ENABLE_EMAIL_PASSWORD in configs)
  const saved = (instance.configurations as Record<string, string>) ?? {};
  const emailEnabled = saved["ENABLE_EMAIL_PASSWORD"];
  if (emailEnabled !== undefined && emailEnabled !== "1" && emailEnabled !== "true") {
    set.status = 400;
    return { error_code: 4036, error_message: "EMAIL_PASSWORD_DISABLED" };
  }

  const existingUser = await findUserByLogin(normalized);
  if (existingUser) {
    return { existing: true, status: "CREDENTIAL" };
  }
  return { existing: false, status: "CREDENTIAL" };
}

// The web app signs in/up by submitting a real browser <form> POST (not AJAX),
// so these endpoints must 302-redirect: on success to next_path (the workspace),
// on failure back to the sign-in page with an ?error_code the web understands.
// Error codes mirror packages helpers/authentication.helper.tsx.
const AUTH_ERR = {
  REQUIRED_SIGN_IN: "5070", // REQUIRED_EMAIL_PASSWORD_SIGN_IN
  FAILED_SIGN_IN: "5065", // AUTHENTICATION_FAILED_SIGN_IN
  REQUIRED_SIGN_UP: "5040", // REQUIRED_EMAIL_PASSWORD_SIGN_UP
  USER_ALREADY_EXISTS: "5030", // USER_ALREADY_EXIST
} as const;

// Only allow relative in-app paths to avoid open redirects.
function safeNext(nextPath: any): string {
  const p = typeof nextPath === "string" ? nextPath : "";
  return p.startsWith("/") && !p.startsWith("//") ? p : "/";
}
function authRedirect(set: any, location: string) {
  set.headers["Location"] = location;
  set.status = 302;
  return null;
}

// API clients (mobile) send Accept: application/json; browser form POSTs send text/html.
function wantsJson(headers: Record<string, string | undefined>): boolean {
  return (headers["accept"] ?? "").includes("application/json");
}

function authUserDto(u: any, token: string) {
  return {
    id: u.id,
    email: u.email,
    first_name: u.firstName,
    last_name: u.lastName,
    display_name: u.displayName,
    avatar_url: u.avatar,
    is_instance_admin: u.isInstanceAdmin,
    is_superuser: u.isSuperuser,
    token,
  };
}

/**
 * Registra tentativa de acesso na trilha LGPD. A trilha é por workspace, e no
 * login ainda não há workspace escolhido — usamos o primeiro do usuário (ou
 * ignoramos, se ele não pertence a nenhum: não há a quem prestar contas ainda).
 */
async function auditAuth(
  action: string,
  email: string,
  headers: any,
  user?: { id: string; email: string } | null,
  metadata: Record<string, unknown> = {}
) {
  try {
    const membership = user
      ? await prisma.workspaceMember.findFirst({
          where: { memberId: user.id, isActive: true, deletedAt: null },
          select: { workspaceId: true },
          orderBy: { createdAt: "asc" },
        })
      : null;
    if (!membership) return;
    await recordAudit({
      workspaceId: membership.workspaceId,
      entity: AUDIT_ENTITIES.USER,
      entityId: user?.id ?? email,
      action,
      actor: user ? { id: user.id, email: user.email } : { id: null, email },
      headers,
      metadata,
    });
  } catch (e) {
    console.error("[audit-auth]", e);
  }
}

/** Resolve o usuário a partir do cookie de sessão (para o logout, que não usa authPlugin). */
async function userFromCookie(headers: any): Promise<{ id: string; email: string } | null> {
  try {
    const cookie: string = (typeof headers?.get === "function" ? headers.get("cookie") : headers?.cookie) ?? "";
    return await findSessionUser(readRawSessionToken({ cookie }));
  } catch {
    return null;
  }
}

// ── Shared sign-in logic ───────────────────────────────────────────────────────
async function signIn(b: any, set: any, json = false, headers?: any) {
  const next = safeNext(b?.next_path);
  const jsonError = (status: number, detail: string) => {
    set.status = status;
    return { detail };
  };
  if (!b?.email || !b?.password) {
    return json
      ? jsonError(400, "Informe e-mail e senha.")
      : authRedirect(set, `/?error_code=${AUTH_ERR.REQUIRED_SIGN_IN}`);
  }
  const email = normalizeLogin(b.email);
  const fail = () =>
    json
      ? jsonError(403, "E-mail ou senha inválidos.")
      : authRedirect(set, `/?error_code=${AUTH_ERR.FAILED_SIGN_IN}&email=${encodeURIComponent(email)}`);
  const user = await findUserByLogin(email);
  if (!user?.password || !user.isActive) {
    auditAuth(AUDIT_ACTIONS.LOGIN_FAILED, email, headers, user, {
      motivo: user ? "inativo ou sem senha" : "usuário inexistente",
    });
    return fail();
  }
  const valid = await Bun.password.verify(b.password, user.password);
  if (!valid) {
    auditAuth(AUDIT_ACTIONS.LOGIN_FAILED, email, headers, user, { motivo: "senha inválida" });
    return fail();
  }

  const token = await signSessionToken(user);
  set.headers["Set-Cookie"] = setCookieHeader(token);
  auditAuth(AUDIT_ACTIONS.LOGIN, email, headers, user);
  return json ? authUserDto(user, token) : authRedirect(set, next);
}

// ── Shared sign-up logic ───────────────────────────────────────────────────────
async function signUp(b: any, set: any) {
  const next = safeNext(b?.next_path);
  if (!b?.email || !b?.password) return authRedirect(set, `/?error_code=${AUTH_ERR.REQUIRED_SIGN_UP}`);
  const email = String(b.email).toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing)
    return authRedirect(set, `/?error_code=${AUTH_ERR.USER_ALREADY_EXISTS}&email=${encodeURIComponent(email)}`);

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
      language: "pt-BR",
    },
  });
  const token = await signSessionToken(user);
  set.headers["Set-Cookie"] = setCookieHeader(token);
  return authRedirect(set, next);
}

// ── Public auth routes ─────────────────────────────────────────────────────────
export const sessionAuthModule = new Elysia()

  // ── Email check (determines credential vs magic link) ────────────────────────
  .post("/auth/email-check/", async ({ body, set }) => emailCheck((body as any)?.email, set))
  .post("/auth/spaces/email-check/", async ({ body, set }) => emailCheck((body as any)?.email, set))

  // ── Sign-in / sign-up / sign-out ─────────────────────────────────────────────
  .post("/auth/sign-in/", async ({ body, set, headers }) => signIn(body, set, wantsJson(headers), headers))
  .post("/auth/sign-up/", async ({ body, set }) => signUp(body, set))
  // The web app logs out by submitting a browser form to this endpoint, so we
  // must clear the cookie AND redirect (302) to the app root — a 204 would leave
  // the user on a blank page, still "logged in" client-side.
  .post("/auth/sign-out/", async ({ set, headers }) => {
    // Encerramento de sessão também entra na trilha (quem saiu, quando, de onde).
    const user = await userFromCookie(headers);
    if (user) auditAuth(AUDIT_ACTIONS.LOGOUT, user.email, headers, user);
    set.headers["Set-Cookie"] = clearCookieHeader();
    set.headers["Location"] = "/";
    set.status = 302;
    return null;
  })
  // Encerra TODAS as sessões do usuário (outros navegadores e aparelhos também).
  .post("/auth/sign-out-everywhere/", async ({ set, headers }) => {
    const resolved = await resolveTokenFromRequest(headers as any);
    if (!resolved) {
      set.status = 401;
      return { detail: "Não autenticado." };
    }
    await revokeUserSessions(resolved.sub);
    auditAuth(
      AUDIT_ACTIONS.LOGOUT,
      resolved.email,
      headers,
      { id: resolved.sub, email: resolved.email },
      { todas_as_sessoes: true }
    );
    set.headers["Set-Cookie"] = clearCookieHeader();
    set.status = 204;
    return null;
  })

  // Spaces variants (same logic, different path prefix used by the spaces app)
  .post("/auth/spaces/sign-in/", async ({ body, set, headers }) => signIn(body, set, wantsJson(headers), headers))
  .post("/auth/spaces/sign-up/", async ({ body, set }) => signUp(body, set))
  .post("/auth/spaces/sign-out/", ({ set }) => {
    set.headers["Set-Cookie"] = clearCookieHeader();
    set.headers["Location"] = "/";
    set.status = 302;
    return null;
  })

  // ── CSRF token (not needed for JWT, but the web app refuses to submit the
  // sign-out form when it's empty, so return a non-empty opaque token) ─────────
  .get("/auth/get-csrf-token/", () => ({ csrf_token: crypto.randomUUID().replace(/-/g, "") }))

  // ── Token refresh ────────────────────────────────────────────────────────────
  .post("/auth/token/refresh/", async ({ body, headers, set }) => {
    const b = body as any;
    const cookieHeader = headers["cookie"] ?? "";
    const match = cookieHeader.match(/(?:^|;\s*)plane_auth=([^;]+)/);
    const rawToken = b?.refresh_token ?? (match?.[1] ? decodeURIComponent(match[1]) : null);
    if (!rawToken) {
      set.status = 401;
      return { detail: "Nenhum token informado." };
    }
    const user = await findSessionUser(rawToken);
    if (!user) {
      set.status = 401;
      return { detail: "Token inválido ou expirado." };
    }
    const newToken = await signSessionToken(user);
    set.headers["Set-Cookie"] = setCookieHeader(newToken);
    return { token: newToken, access: newToken };
  })

  // ── Password management ──────────────────────────────────────────────────────
  .post("/auth/forgot-password/", async ({ body, headers, set }) => forgotPassword(body, headers, set))
  .post("/auth/spaces/forgot-password/", async ({ body, headers, set }) => forgotPassword(body, headers, set))
  .post("/auth/reset-password/:uidb64/:token/", async ({ params, body, set, headers }) =>
    resetPassword(params, body, set, headers)
  )
  .post("/auth/spaces/reset-password/:uidb64/:token/", async ({ params, body, set, headers }) =>
    resetPassword(params, body, set, headers)
  )
  .post("/auth/set-password/", async ({ body, headers, set }) => {
    const resolved = await resolveTokenFromRequest(headers as any);
    if (!resolved) {
      set.status = 401;
      return { detail: "Não autenticado." };
    }
    const b = body as any;
    if (!b.password) {
      set.status = 400;
      return { detail: "password é obrigatório." };
    }
    const hash = await Bun.password.hash(b.password, BCRYPT);
    await renewSessionCookie(resolved.sub, set, { password: hash, isPasswordAutoset: false });
    return { detail: "Senha definida com sucesso." };
  })
  .post("/auth/change-password/", async ({ body, headers, set }) => {
    const resolved = await resolveTokenFromRequest(headers as any);
    if (!resolved) {
      set.status = 401;
      return { detail: "Não autenticado." };
    }
    const b = body as any;
    if (!b.old_password || !b.new_password) {
      set.status = 400;
      return { detail: "old_password e new_password são obrigatórios." };
    }
    const user = await prisma.user.findUnique({ where: { id: resolved.sub } });
    if (!user?.password) {
      set.status = 400;
      return { detail: "Nenhuma senha definida. Use set-password." };
    }
    const valid = await Bun.password.verify(b.old_password, user.password);
    if (!valid) {
      set.status = 400;
      return { detail: "A senha atual está incorreta." };
    }
    const hash = await Bun.password.hash(b.new_password, BCRYPT);
    // As outras sessões caem; a atual segue com o cookie renovado.
    await renewSessionCookie(user.id, set, { password: hash, isPasswordAutoset: false });
    auditAuth(AUDIT_ACTIONS.PASSWORD_CHANGE, user.email, headers, user);
    return { detail: "Senha alterada com sucesso." };
  })

  // ── Magic link stubs (SMTP required — not configured) ───────────────────────
  .post("/auth/magic-generate/", ({ set }) => {
    set.status = 400;
    return { error_code: 5007, error_message: "SMTP_NOT_CONFIGURED", detail: "O e-mail não está configurado." };
  })
  .post("/auth/magic-sign-in/", ({ set }) => {
    set.status = 400;
    return { error_code: 5007, error_message: "SMTP_NOT_CONFIGURED", detail: "O e-mail não está configurado." };
  })
  .post("/auth/magic-sign-up/", ({ set }) => {
    set.status = 400;
    return { error_code: 5007, error_message: "SMTP_NOT_CONFIGURED", detail: "O e-mail não está configurado." };
  })
  .post("/auth/spaces/magic-generate/", ({ set }) => {
    set.status = 400;
    return { error_code: 5007, error_message: "SMTP_NOT_CONFIGURED", detail: "O e-mail não está configurado." };
  })
  .post("/auth/spaces/magic-sign-in/", ({ set }) => {
    set.status = 400;
    return { error_code: 5007, error_message: "SMTP_NOT_CONFIGURED", detail: "O e-mail não está configurado." };
  })
  .post("/auth/spaces/magic-sign-up/", ({ set }) => {
    set.status = 400;
    return { error_code: 5007, error_message: "SMTP_NOT_CONFIGURED", detail: "O e-mail não está configurado." };
  })

  // ── OAuth stubs (not configured) ─────────────────────────────────────────────
  .get("/auth/gitlab/", ({ set }) => {
    set.status = 400;
    return { detail: "OAuth do GitLab não configurado." };
  })
  .get("/auth/gitlab/callback/", ({ set }) => {
    set.status = 400;
    return { detail: "OAuth do GitLab não configurado." };
  })
  .get("/auth/spaces/gitlab/", ({ set }) => {
    set.status = 400;
    return { detail: "OAuth do GitLab não configurado." };
  })
  .get("/auth/spaces/gitlab/callback/", ({ set }) => {
    set.status = 400;
    return { detail: "OAuth do GitLab não configurado." };
  })
  .get("/auth/github/", ({ set }) => {
    set.status = 400;
    return { detail: "OAuth do GitHub não configurado." };
  })
  .get("/auth/github/callback/", ({ set }) => {
    set.status = 400;
    return { detail: "OAuth do GitHub não configurado." };
  })
  .get("/auth/spaces/github/", ({ set }) => {
    set.status = 400;
    return { detail: "OAuth do GitHub não configurado." };
  })
  .get("/auth/spaces/github/callback/", ({ set }) => {
    set.status = 400;
    return { detail: "OAuth do GitHub não configurado." };
  })
  .get("/auth/google/", ({ set }) => {
    set.status = 400;
    return { detail: "OAuth do Google não configurado." };
  })
  .get("/auth/google/callback/", ({ set }) => {
    set.status = 400;
    return { detail: "OAuth do Google não configurado." };
  })
  .get("/auth/spaces/google/", ({ set }) => {
    set.status = 400;
    return { detail: "OAuth do Google não configurado." };
  })
  .get("/auth/spaces/google/callback/", ({ set }) => {
    set.status = 400;
    return { detail: "OAuth do Google não configurado." };
  })
  .get("/auth/gitea/", ({ set }) => {
    set.status = 400;
    return { detail: "OAuth do Gitea não configurado." };
  })
  .get("/auth/gitea/callback/", ({ set }) => {
    set.status = 400;
    return { detail: "OAuth do Gitea não configurado." };
  })
  .get("/auth/spaces/gitea/", ({ set }) => {
    set.status = 400;
    return { detail: "OAuth do Gitea não configurado." };
  })
  .get("/auth/spaces/gitea/callback/", ({ set }) => {
    set.status = 400;
    return { detail: "OAuth do Gitea não configurado." };
  })

  // ── Me / session endpoints ────────────────────────────────────────────────────
  .get("/auth/me/", async ({ headers, set }) => {
    const resolved = await resolveTokenFromRequest(headers as any);
    if (!resolved) {
      set.status = 401;
      return { detail: "Não autenticado." };
    }
    const user = await prisma.user.findUnique({
      where: { id: resolved.sub },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        displayName: true,
        avatar: true,
        userTimezone: true,
        isActive: true,
        isSuperuser: true,
        isStaff: true,
        isInstanceAdmin: true,
        dateJoined: true,
      },
    });
    if (!user) {
      set.status = 401;
      return { detail: "Usuário não encontrado." };
    }
    return user;
  })

  .get("/auth/instance/", async ({ headers, set }) => {
    const resolved = await resolveTokenFromRequest(headers as any);
    if (!resolved) {
      set.status = 401;
      return { detail: "Não autenticado." };
    }
    const user = await prisma.user.findUnique({
      where: { id: resolved.sub },
      select: { id: true, email: true, displayName: true, isInstanceAdmin: true, isSuperuser: true },
    });
    if (!user || (!user.isInstanceAdmin && !user.isSuperuser)) {
      set.status = 403;
      return { detail: "É necessário ser administrador da instância." };
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
          where: { userId: user.id },
          skip,
          take,
          select: {
            id: true,
            label: true,
            description: true,
            isActive: true,
            expiredAt: true,
            lastUsed: true,
            createdAt: true,
          },
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
    if (!token) {
      set.status = 404;
      return { detail: "Token não encontrado." };
    }
    return token;
  })

  .patch("/users/api-tokens/:token_id/", async ({ params: { token_id }, body, user, set }) => {
    const token = await prisma.apiToken.findFirst({ where: { id: token_id, userId: user.id } });
    if (!token) {
      set.status = 404;
      return { detail: "Token não encontrado." };
    }
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
    if (!token) {
      set.status = 404;
      return { detail: "Token não encontrado." };
    }
    await prisma.apiToken.delete({ where: { id: token_id } });
    set.status = 204;
    return null;
  });
