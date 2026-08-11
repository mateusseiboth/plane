import prisma from "@/db";
import {paginate} from "@/utils/pagination";
import {invalidatePrioritySlaCache} from "@/utils/sla";
import {Elysia} from "elysia";
import {SignJWT, jwtVerify} from "jose";

const DEFAULT_PRIORITY_SLA = {urgent: -8, high: -4, medium: 0, low: 8, none: 0};

const JWT_SECRET_BYTES = new TextEncoder().encode(process.env.JWT_SECRET ?? "plane-jwt-secret-change-in-production");
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function setCookieHeader(token: string): string {
  return `plane_auth=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
}

function clearCookieHeader(): string {
  return `plane_auth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

async function signToken(sub: string, email: string): Promise<string> {
  return new SignJWT({sub, email}).setProtectedHeader({alg: "HS256"}).setIssuedAt().setExpirationTime("7d").sign(JWT_SECRET_BYTES);
}

async function resolveUser(headers: Record<string, string | undefined>) {
  const cookieHeader = headers["cookie"] ?? "";
  const match = cookieHeader.match(/(?:^|;\s*)plane_auth=([^;]+)/);
  const rawToken = headers["authorization"]?.replace("Bearer ", "") ?? (match?.[1] ? decodeURIComponent(match[1]) : null);
  if (!rawToken) return null;
  try {
    const {payload} = await jwtVerify(rawToken, JWT_SECRET_BYTES);
    if (!payload.sub) return null;
    return prisma.user.findUnique({where: {id: payload.sub as string}});
  } catch {
    return null;
  }
}

function userDto(u: any) {
  return {
    id: u.id,
    email: u.email,
    first_name: u.firstName,
    last_name: u.lastName,
    display_name: u.displayName,
    avatar: u.avatar,
    is_active: u.isActive,
    is_instance_admin: u.isInstanceAdmin,
    is_superuser: u.isSuperuser,
  };
}

// ── Admin-facing config keys (what the admin app reads/writes) ──────────────
// These are the canonical keys stored in DB and returned from /configurations/
const ADMIN_CONFIG_DEFAULTS: Record<string, string> = {
  ENABLE_SIGNUP:            "1",
  ENABLE_EMAIL_PASSWORD:    "1",   // "1" = enabled, "0" = disabled
  ENABLE_MAGIC_LINK_LOGIN:  "0",
  IS_GOOGLE_ENABLED:        "0",
  IS_GITHUB_ENABLED:        "0",
  IS_GITLAB_ENABLED:        "0",
  IS_GITEA_ENABLED:         "0",
  IS_WORKSPACE_CREATION_DISABLED: "0",
  GITHUB_APP_NAME:          "",
  SLACK_CLIENT_ID:          "",
  POSTHOG_API_KEY:          "",
  POSTHOG_HOST:             "",
  HAS_UNSPLASH_CONFIGURED:  "0",
  HAS_LLM_CONFIGURED:       "0",
  FILE_SIZE_LIMIT:          "5242880",
  IS_SMTP_CONFIGURED:       "0",
  ADMIN_BASE_URL:           process.env.APP_BASE_URL ?? "http://localhost:8080/god-mode",
  SPACE_BASE_URL:           process.env.APP_BASE_URL ?? "http://localhost:8080/spaces",
  APP_BASE_URL:             process.env.APP_BASE_URL ?? "http://localhost:8080",
  INSTANCE_CHANGELOG_URL:   "",
  IS_SELF_MANAGED:          "1",
};

// truthy: "1", "true", "yes" → anything else is falsy
function isTruthy(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "yes";
}

// Derive the IInstanceConfig object (used by the main web app) from stored admin configs
function buildInstanceConfig(saved: Record<string, string> = {}) {
  const g = (k: string) => saved[k] ?? ADMIN_CONFIG_DEFAULTS[k] ?? "";
  return {
    enable_signup:                  isTruthy(g("ENABLE_SIGNUP")),
    is_workspace_creation_disabled: isTruthy(g("IS_WORKSPACE_CREATION_DISABLED")),
    is_google_enabled:              isTruthy(g("IS_GOOGLE_ENABLED")),
    is_github_enabled:              isTruthy(g("IS_GITHUB_ENABLED")),
    is_gitlab_enabled:              isTruthy(g("IS_GITLAB_ENABLED")),
    is_gitea_enabled:               isTruthy(g("IS_GITEA_ENABLED")),
    is_magic_login_enabled:         isTruthy(g("ENABLE_MAGIC_LINK_LOGIN")),
    is_email_password_enabled:      isTruthy(g("ENABLE_EMAIL_PASSWORD")),
    github_app_name:                g("GITHUB_APP_NAME"),
    slack_client_id:                g("SLACK_CLIENT_ID") || null,
    posthog_api_key:                g("POSTHOG_API_KEY") || null,
    posthog_host:                   g("POSTHOG_HOST") || null,
    has_unsplash_configured:        isTruthy(g("HAS_UNSPLASH_CONFIGURED")),
    has_llm_configured:             isTruthy(g("HAS_LLM_CONFIGURED")),
    file_size_limit:                Number(g("FILE_SIZE_LIMIT")) || 5242880,
    is_smtp_configured:             isTruthy(g("IS_SMTP_CONFIGURED")),
    admin_base_url:                 g("ADMIN_BASE_URL"),
    space_base_url:                 g("SPACE_BASE_URL"),
    app_base_url:                   g("APP_BASE_URL"),
    instance_changelog_url:         g("INSTANCE_CHANGELOG_URL"),
    is_self_managed:                true,
  };
}

// Build the configurations array returned to the admin app
function instanceConfigurationsDto(saved: Record<string, string> = {}) {
  return Object.entries(ADMIN_CONFIG_DEFAULTS).map(([key, defaultValue]) => ({
    key,
    value: saved[key] ?? defaultValue,
    is_encrypted: false,
  }));
}

export const instanceModule = new Elysia({prefix: "/instances"})

  // ── Instance ─────────────────────────────────────────────────────────────────

  .get("/", async ({set}) => {
    const instance = await prisma.instance.findFirst();
    if (!instance) return {is_activated: false, is_setup_done: false};
    const workspaceCount = await prisma.workspace.count();
    const saved = (instance.configurations as Record<string, string>) ?? {};
    return {
      config: buildInstanceConfig(saved),
      instance: {
        id: instance.id,
        instance_name: instance.instanceName,
        instance_id: instance.instanceId,
        current_version: instance.currentVersion,
        latest_version: instance.latestVersion,
        edition: instance.edition,
        domain: instance.domain,
        is_telemetry_enabled: instance.isTelemetryEnabled,
        is_support_required: instance.isSupportRequired,
        is_setup_done: instance.isSetupDone,
        is_signup_screen_visited: instance.isSignupScreenVisited,
        is_activated: true,
        workspaces_exist: workspaceCount >= 1,
      },
    };
  })

  .patch("/", async ({body, headers, set}) => {
    // Instance settings are god-mode: gate by isInstanceAdmin, never by workspace role.
    const caller = await resolveUser(headers as any);
    if (!caller?.isInstanceAdmin) {
      set.status = 403;
      return {detail: "É necessário ser administrador da instância."};
    }
    const instance = await prisma.instance.findFirst();
    if (!instance) {
      set.status = 400;
      return {error: "Instância não encontrada"};
    }
    const data = body as Record<string, any>;
    return prisma.instance.update({
      where: {id: instance.id},
      data: {
        ...(data.instance_name !== undefined && {instanceName: data.instance_name}),
        ...(data.is_telemetry_enabled !== undefined && {isTelemetryEnabled: data.is_telemetry_enabled}),
        ...(data.is_support_required !== undefined && {isSupportRequired: data.is_support_required}),
        ...(data.is_setup_done !== undefined && {isSetupDone: data.is_setup_done}),
        ...(data.domain !== undefined && {domain: data.domain}),
      },
    });
  })

  .post("/signup-screen-visited/", async ({set}) => {
    const instance = await prisma.instance.findFirst();
    if (!instance) {
      set.status = 400;
      return {error: "A instância não está configurada"};
    }
    await prisma.instance.update({where: {id: instance.id}, data: {isSignupScreenVisited: true}});
    set.status = 204;
    return null;
  })

  // ── Admin sign-up (first-time setup) ─────────────────────────────────────────

  .post("/admins/sign-up/", async ({body, set}) => {
    const instance = await prisma.instance.findFirst();
    if (!instance) {
      set.status = 400;
      return {error: "A instância não está configurada."};
    }

    const alreadyHasAdmin = await prisma.user.findFirst({where: {isInstanceAdmin: true}});
    if (alreadyHasAdmin) {
      set.status = 400;
      return {error: "Já existe um administrador da instância."};
    }

    const b = body as any;
    if (!b.email || !b.password || !b.first_name) {
      set.status = 400;
      return {error: "email, password e first_name são obrigatórios."};
    }

    const email = String(b.email).toLowerCase().trim();
    const exists = await prisma.user.findUnique({where: {email}});
    if (exists) {
      set.status = 400;
      return {error: "Já existe um usuário com este e-mail."};
    }

    const hash = await Bun.password.hash(b.password, {algorithm: "bcrypt", cost: 12});
    const user = await prisma.user.create({
      data: {
        email,
        username: `admin_${Date.now()}`,
        firstName: String(b.first_name).slice(0, 50),
        lastName: String(b.last_name ?? "").slice(0, 50),
        displayName: `${b.first_name} ${b.last_name ?? ""}`.trim().slice(0, 100),
        password: hash,
        isActive: true,
        isInstanceAdmin: true,
        isSuperuser: true,
        isPasswordAutoset: false,
      },
    });

    await prisma.instance.update({
      where: {id: instance.id},
      data: {
        isSetupDone: true,
        ...(b.company_name && {instanceName: b.company_name}),
        ...(b.is_telemetry_enabled !== undefined && {isTelemetryEnabled: b.is_telemetry_enabled}),
      },
    });

    const token = await signToken(user.id, user.email);
    set.headers["Set-Cookie"] = setCookieHeader(token);
    set.status = 201;
    return {...userDto(user), token};
  })

  // ── Admin sign-in ─────────────────────────────────────────────────────────────

  /**
   * Entrada do god-mode.
   *
   * O formulário é um POST de HTML puro (herança do Django, que respondia com
   * redirecionamento). Devolver JSON para ele jogava o administrador numa
   * página com o token cru na tela em vez de entrar no painel — a conta tinha
   * acesso e mesmo assim parecia não funcionar. Quando quem chama é um
   * navegador, a resposta volta a ser um redirecionamento; cliente de API que
   * pede JSON continua recebendo JSON.
   */
  .post("/admins/sign-in/", async ({body, set, headers}) => {
    const doNavegador = String(headers.accept ?? "").includes("text/html");
    const paraOPainel = (erro?: string) => {
      set.status = 302;
      set.headers["Location"] = erro ? `/god-mode/?error_message=${encodeURIComponent(erro)}` : "/god-mode/";
      return "";
    };
    const instance = await prisma.instance.findFirst();
    if (!instance) {
      set.status = 400;
      return {error: "A instância não está configurada."};
    }

    const b = body as any;
    if (!b.email || !b.password) {
      if (doNavegador) return paraOPainel("email e password são obrigatórios.");
      set.status = 400;
      return {error: "email e password são obrigatórios."};
    }

    const email = String(b.email).toLowerCase().trim();
    const user = await prisma.user.findUnique({where: {email}});
    if (!user || !user.password) {
      if (doNavegador) return paraOPainel("Credenciais inválidas.");
      set.status = 403;
      return {error: "Credenciais inválidas."};
    }
    if (!user.isActive) {
      if (doNavegador) return paraOPainel("Esta conta está desativada.");
      set.status = 403;
      return {error: "Esta conta está desativada."};
    }
    if (!user.isInstanceAdmin) {
      if (doNavegador) return paraOPainel("É necessário ser administrador da instância.");
      set.status = 403;
      return {error: "É necessário ser administrador da instância."};
    }

    const valid = await Bun.password.verify(b.password, user.password);
    if (!valid) {
      set.status = 403;
      return {error: "Credenciais inválidas."};
    }

    const token = await signToken(user.id, user.email);
    set.headers["Set-Cookie"] = setCookieHeader(token);
    if (doNavegador) return paraOPainel();
    return {...userDto(user), token};
  })

  // ── Admin sign-out ────────────────────────────────────────────────────────────

  .post("/admins/sign-out/", async ({set}) => {
    set.headers["Set-Cookie"] = clearCookieHeader();
    set.status = 200;
    return {detail: "Sessão encerrada."};
  })

  // ── Admin session check ───────────────────────────────────────────────────────

  .get("/admins/session/", async ({headers}) => {
    const user = await resolveUser(headers as any);
    if (!user || !user.isInstanceAdmin) return {is_authenticated: false};
    return {is_authenticated: true, user: userDto(user)};
  })

  // ── Admin me ──────────────────────────────────────────────────────────────────

  .get("/admins/me/", async ({headers, set}) => {
    const user = await resolveUser(headers as any);
    if (!user) {
      set.status = 401;
      return {detail: "Não autenticado."};
    }
    if (!user.isInstanceAdmin) {
      set.status = 403;
      return {detail: "É necessário ser administrador da instância."};
    }
    return userDto(user);
  })

  // ── Admins list / create / delete ─────────────────────────────────────────────

  .get("/admins/", async ({headers, set}) => {
    const caller = await resolveUser(headers as any);
    if (!caller?.isInstanceAdmin) {
      set.status = 403;
      return {detail: "É necessário ser administrador da instância."};
    }
    const admins = await prisma.user.findMany({
      where: {isInstanceAdmin: true},
      select: {id: true, email: true, firstName: true, lastName: true, displayName: true, isActive: true, createdAt: true},
    });
    return admins.map((u) => ({
      id: u.id,
      user: {id: u.id, email: u.email, display_name: u.displayName, first_name: u.firstName, last_name: u.lastName},
      created_at: u.createdAt,
    }));
  })

  .post("/admins/", async ({body, headers, set}) => {
    const caller = await resolveUser(headers as any);
    if (!caller?.isInstanceAdmin) {
      set.status = 403;
      return {detail: "É necessário ser administrador da instância."};
    }
    const b = body as any;
    if (!b.email) {
      set.status = 400;
      return {detail: "email é obrigatório."};
    }
    const user = await prisma.user.findUnique({where: {email: String(b.email).toLowerCase().trim()}});
    if (!user) {
      set.status = 404;
      return {detail: "Usuário não encontrado."};
    }
    if (user.isInstanceAdmin) {
      set.status = 400;
      return {detail: "O usuário já é administrador da instância."};
    }
    const updated = await prisma.user.update({where: {id: user.id}, data: {isInstanceAdmin: true}});
    set.status = 201;
    return {
      id: updated.id,
      user: {id: updated.id, email: updated.email, display_name: updated.displayName},
    };
  })

  .delete("/admins/:pk/", async ({params, headers, set}) => {
    const caller = await resolveUser(headers as any);
    if (!caller?.isInstanceAdmin) {
      set.status = 403;
      return {detail: "É necessário ser administrador da instância."};
    }
    if (caller.id === params.pk) {
      set.status = 400;
      return {detail: "Você não pode remover a si mesmo."};
    }
    await prisma.user.update({where: {id: params.pk}, data: {isInstanceAdmin: false}});
    set.status = 204;
    return null;
  })

  // ── Configurations ────────────────────────────────────────────────────────────

  .get("/configurations/", async ({headers, set}) => {
    const caller = await resolveUser(headers as any);
    if (!caller?.isInstanceAdmin) {
      set.status = 403;
      return {detail: "É necessário ser administrador da instância."};
    }
    const instance = await prisma.instance.findFirst();
    const saved = (instance?.configurations as Record<string, string>) ?? {};
    return instanceConfigurationsDto(saved);
  })

  .patch("/configurations/", async ({body, headers, set}) => {
    const caller = await resolveUser(headers as any);
    if (!caller?.isInstanceAdmin) {
      set.status = 403;
      return {detail: "É necessário ser administrador da instância."};
    }
    const instance = await prisma.instance.findFirst();
    if (!instance) { set.status = 400; return {detail: "Instância não encontrada."}; }

    const incoming = body as Record<string, unknown>;
    const existing = (instance.configurations as Record<string, string>) ?? {};
    const merged: Record<string, string> = {
      ...existing,
      ...Object.fromEntries(
        Object.entries(incoming).map(([k, v]) => [k.toUpperCase(), v === null ? "" : String(v)])
      ),
    };

    await prisma.instance.update({
      where: {id: instance.id},
      data: {configurations: merged},
    });

    return instanceConfigurationsDto(merged);
  })

  // ── Priority SLA config (C4) ─────────────────────────────────────────────
  // Kept separate from /configurations/ because that endpoint flattens keys to
  // UPPERCASE strings, which would corrupt this nested object.
  .get("/priority-sla/", async ({headers, set}) => {
    const caller = await resolveUser(headers as any);
    if (!caller?.isInstanceAdmin) {
      set.status = 403;
      return {detail: "É necessário ser administrador da instância."};
    }
    const instance = await prisma.instance.findFirst({select: {configurations: true}});
    const cfg = (instance?.configurations as any)?.priority_sla;
    return {priority_sla: cfg && typeof cfg === "object" ? {...DEFAULT_PRIORITY_SLA, ...cfg} : DEFAULT_PRIORITY_SLA};
  })

  .patch("/priority-sla/", async ({body, headers, set}) => {
    const caller = await resolveUser(headers as any);
    if (!caller?.isInstanceAdmin) {
      set.status = 403;
      return {detail: "É necessário ser administrador da instância."};
    }
    const instance = await prisma.instance.findFirst();
    if (!instance) { set.status = 400; return {detail: "Instância não encontrada."}; }
    const incoming = (body as any)?.priority_sla ?? body;
    const existing = (instance.configurations as any) ?? {};
    const current = existing.priority_sla && typeof existing.priority_sla === "object" ? existing.priority_sla : DEFAULT_PRIORITY_SLA;
    const next: Record<string, number> = {...DEFAULT_PRIORITY_SLA, ...current};
    for (const k of ["urgent", "high", "medium", "low", "none"]) {
      if (incoming && typeof incoming[k] === "number") next[k] = incoming[k];
    }
    await prisma.instance.update({where: {id: instance.id}, data: {configurations: {...existing, priority_sla: next}}});
    invalidatePrioritySlaCache();
    return {priority_sla: next};
  })

  .delete("/configurations/disable-email-feature/", async ({headers, set}) => {
    const caller = await resolveUser(headers as any);
    if (!caller?.isInstanceAdmin) {
      set.status = 403;
      return {detail: "É necessário ser administrador da instância."};
    }
    return {detail: "Recurso de e-mail desativado."};
  })

  // ── Email credential check ────────────────────────────────────────────────────

  .post("/email-credentials-check/", async ({body, headers, set}) => {
    const caller = await resolveUser(headers as any);
    if (!caller?.isInstanceAdmin) {
      set.status = 403;
      return {detail: "É necessário ser administrador da instância."};
    }
    set.status = 400;
    return {error: "O SMTP não está configurado nesta instalação."};
  })

  // ── Workspace slug availability ───────────────────────────────────────────────

  .get("/workspace-slug-check/", async ({query, headers, set}) => {
    const caller = await resolveUser(headers as any);
    if (!caller?.isInstanceAdmin) {
      set.status = 403;
      return {detail: "É necessário ser administrador da instância."};
    }
    const slug = query.slug as string | undefined;
    if (!slug) {
      set.status = 400;
      return {error: "slug é obrigatório."};
    }
    const RESTRICTED = ["admin", "api", "auth", "plane", "god-mode", "spaces", "home", "login", "signup", "settings"];
    const taken =
      RESTRICTED.includes(slug.toLowerCase()) || (await prisma.workspace.findFirst({where: {slug: slug.toLowerCase()}})) !== null;
    return {status: !taken};
  })

  // ── Workspaces (admin view) ───────────────────────────────────────────────────

  .get("/workspaces/", async ({headers, query, set}) => {
    const caller = await resolveUser(headers as any);
    if (!caller?.isInstanceAdmin) {
      set.status = 403;
      return {detail: "É necessário ser administrador da instância."};
    }
    return paginate({
      query: async (skip, take) =>
        prisma.workspace.findMany({
          where: {deletedAt: null},
          skip,
          take,
          orderBy: {createdAt: "desc"},
          include: {
            members: {
              where: {deletedAt: null},
              include: {
                member: {
                  select: {id: true, email: true, firstName: true, lastName: true, displayName: true, avatar: true},
                },
              },
            },
            _count: {
              select: {
                members: {where: {deletedAt: null}},
                projects: {where: {deletedAt: null}},
              },
            },
          },
        }),
      count: () => prisma.workspace.count({where: {deletedAt: null}}),
      cursor: query.cursor as string | undefined,
      transform: (workspaces) =>
        workspaces.map((workspace: any) => {
          const ownerMember = workspace.members.find((member: any) => member.role >= 20) ?? workspace.members[0];

          return {
            id: workspace.id,
            name: workspace.name,
            slug: workspace.slug,
            url: workspace.slug,
            logo: workspace.logo,
            logo_url: workspace.logoUrl ?? null,
            created_at: workspace.createdAt,
            updated_at: workspace.updatedAt,
            created_by: ownerMember?.member?.id ?? "",
            updated_by: ownerMember?.member?.id ?? "",
            owner: ownerMember
              ? {
                  id: ownerMember.member.id,
                  email: ownerMember.member.email,
                  first_name: ownerMember.member.firstName,
                  last_name: ownerMember.member.lastName,
                  display_name: ownerMember.member.displayName,
                  avatar: ownerMember.member.avatar,
                }
              : {id: "", email: "", first_name: "", last_name: "", display_name: "", avatar: ""},
            organization_size: workspace.orgSize ?? "",
            total_members: workspace._count.members,
            total_projects: workspace._count.projects,
            role: ownerMember?.role ?? 5,
            timezone: workspace.timezone,
          };
        }),
    });
  })

  .post("/workspaces/", async ({body, headers, set}) => {
    const caller = await resolveUser(headers as any);
    if (!caller?.isInstanceAdmin) {
      set.status = 403;
      return {detail: "É necessário ser administrador da instância."};
    }
    const b = body as any;
    if (!b.name || !b.slug) {
      set.status = 400;
      return {error: "name e slug são obrigatórios."};
    }
    const existing = await prisma.workspace.findFirst({where: {slug: b.slug}});
    if (existing) {
      set.status = 409;
      return {error: "Já existe um workspace com este slug."};
    }
    const workspace = await prisma.$transaction(async (tx) => {
      const w = await tx.workspace.create({
        data: {name: b.name, slug: b.slug, ownerId: caller.id},
      });
      await tx.workspaceMember.create({
        data: {workspaceId: w.id, memberId: caller.id, role: 20, isActive: true},
      });
      return w;
    });
    set.status = 201;
    return workspace;
  });
