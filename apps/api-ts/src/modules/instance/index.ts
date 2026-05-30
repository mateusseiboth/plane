import prisma from "@/db";
import {paginate} from "@/utils/pagination";
import {Elysia} from "elysia";
import {SignJWT, jwtVerify} from "jose";

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

const instanceConfig = () => ({
  enable_signup: true,
  is_workspace_creation_disabled: false,
  is_google_enabled: false,
  is_github_enabled: false,
  is_gitlab_enabled: false,
  is_gitea_enabled: false,
  is_magic_login_enabled: false,
  is_email_password_enabled: true,
  github_app_name: "",
  slack_client_id: null,
  posthog_api_key: null,
  posthog_host: null,
  has_unsplash_configured: false,
  has_llm_configured: false,
  file_size_limit: 5242880,
  is_smtp_configured: false,
  admin_base_url: process.env.APP_BASE_URL ?? "http://localhost:8080/god-mode",
  space_base_url: process.env.APP_BASE_URL ?? "http://localhost:8080/spaces",
  app_base_url: process.env.APP_BASE_URL ?? "http://localhost:8080",
  instance_changelog_url: "",
  is_self_managed: true,
});

function instanceConfigurationsDto(overrides: Record<string, unknown> = {}) {
  return Object.entries(instanceConfig()).map(([key, value]) => {
    const configKey = key.toUpperCase();
    const configValue = overrides[configKey] ?? value;

    return {
      key: configKey,
      value: configValue === null ? "" : String(configValue),
      is_encrypted: false,
    };
  });
}

export const instanceModule = new Elysia({prefix: "/instances"})

  // ── Instance ─────────────────────────────────────────────────────────────────

  .get("/", async ({set}) => {
    const instance = await prisma.instance.findFirst();
    if (!instance) return {is_activated: false, is_setup_done: false};
    const workspaceCount = await prisma.workspace.count();
    return {
      config: instanceConfig(),
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

  .patch("/", async ({body, set}) => {
    const instance = await prisma.instance.findFirst();
    if (!instance) {
      set.status = 400;
      return {error: "Instance not found"};
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
      return {error: "Instance is not configured"};
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
      return {error: "Instance is not configured."};
    }

    const alreadyHasAdmin = await prisma.user.findFirst({where: {isInstanceAdmin: true}});
    if (alreadyHasAdmin) {
      set.status = 400;
      return {error: "An instance admin already exists."};
    }

    const b = body as any;
    if (!b.email || !b.password || !b.first_name) {
      set.status = 400;
      return {error: "email, password and first_name are required."};
    }

    const email = String(b.email).toLowerCase().trim();
    const exists = await prisma.user.findUnique({where: {email}});
    if (exists) {
      set.status = 400;
      return {error: "A user with this email already exists."};
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

  .post("/admins/sign-in/", async ({body, set}) => {
    const instance = await prisma.instance.findFirst();
    if (!instance) {
      set.status = 400;
      return {error: "Instance is not configured."};
    }

    const b = body as any;
    if (!b.email || !b.password) {
      set.status = 400;
      return {error: "email and password are required."};
    }

    const email = String(b.email).toLowerCase().trim();
    const user = await prisma.user.findUnique({where: {email}});
    if (!user || !user.password) {
      set.status = 403;
      return {error: "Invalid credentials."};
    }
    if (!user.isActive) {
      set.status = 403;
      return {error: "This account is deactivated."};
    }
    if (!user.isInstanceAdmin) {
      set.status = 403;
      return {error: "Instance admin access required."};
    }

    const valid = await Bun.password.verify(b.password, user.password);
    if (!valid) {
      set.status = 403;
      return {error: "Invalid credentials."};
    }

    const token = await signToken(user.id, user.email);
    set.headers["Set-Cookie"] = setCookieHeader(token);
    return {...userDto(user), token};
  })

  // ── Admin sign-out ────────────────────────────────────────────────────────────

  .post("/admins/sign-out/", async ({set}) => {
    set.headers["Set-Cookie"] = clearCookieHeader();
    set.status = 200;
    return {detail: "Signed out."};
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
      return {detail: "Not authenticated."};
    }
    if (!user.isInstanceAdmin) {
      set.status = 403;
      return {detail: "Instance admin access required."};
    }
    return userDto(user);
  })

  // ── Admins list / create / delete ─────────────────────────────────────────────

  .get("/admins/", async ({headers, set}) => {
    const caller = await resolveUser(headers as any);
    if (!caller?.isInstanceAdmin) {
      set.status = 403;
      return {detail: "Instance admin access required."};
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
      return {detail: "Instance admin access required."};
    }
    const b = body as any;
    if (!b.email) {
      set.status = 400;
      return {detail: "email is required."};
    }
    const user = await prisma.user.findUnique({where: {email: String(b.email).toLowerCase().trim()}});
    if (!user) {
      set.status = 404;
      return {detail: "User not found."};
    }
    if (user.isInstanceAdmin) {
      set.status = 400;
      return {detail: "User is already an instance admin."};
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
      return {detail: "Instance admin access required."};
    }
    if (caller.id === params.pk) {
      set.status = 400;
      return {detail: "You cannot remove yourself."};
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
      return {detail: "Instance admin access required."};
    }
    return instanceConfigurationsDto();
  })

  .patch("/configurations/", async ({body, headers, set}) => {
    const caller = await resolveUser(headers as any);
    if (!caller?.isInstanceAdmin) {
      set.status = 403;
      return {detail: "Instance admin access required."};
    }
    return instanceConfigurationsDto(body as Record<string, unknown>);
  })

  .delete("/configurations/disable-email-feature/", async ({headers, set}) => {
    const caller = await resolveUser(headers as any);
    if (!caller?.isInstanceAdmin) {
      set.status = 403;
      return {detail: "Instance admin access required."};
    }
    return {detail: "Email feature disabled."};
  })

  // ── Email credential check ────────────────────────────────────────────────────

  .post("/email-credentials-check/", async ({body, headers, set}) => {
    const caller = await resolveUser(headers as any);
    if (!caller?.isInstanceAdmin) {
      set.status = 403;
      return {detail: "Instance admin access required."};
    }
    set.status = 400;
    return {error: "SMTP is not configured in this deployment."};
  })

  // ── Workspace slug availability ───────────────────────────────────────────────

  .get("/workspace-slug-check/", async ({query, headers, set}) => {
    const caller = await resolveUser(headers as any);
    if (!caller?.isInstanceAdmin) {
      set.status = 403;
      return {detail: "Instance admin access required."};
    }
    const slug = query.slug as string | undefined;
    if (!slug) {
      set.status = 400;
      return {error: "slug is required."};
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
      return {detail: "Instance admin access required."};
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
      return {detail: "Instance admin access required."};
    }
    const b = body as any;
    if (!b.name || !b.slug) {
      set.status = 400;
      return {error: "name and slug are required."};
    }
    const existing = await prisma.workspace.findFirst({where: {slug: b.slug}});
    if (existing) {
      set.status = 409;
      return {error: "Workspace with this slug already exists."};
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
