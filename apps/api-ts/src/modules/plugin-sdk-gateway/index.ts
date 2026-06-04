import Elysia from "elysia";
import { swagger } from "@elysiajs/swagger";
import { createHmac, createHash, randomUUID } from "crypto";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { getWorkspaceOrFail } from "@utils/workspace";

// Shared secret platform↔plugin-backend (HMAC of the per-plugin key). Set in env.
const BRIDGE_SECRET = process.env.PLUGIN_BRIDGE_SECRET ?? "plugin-bridge-secret-change-me";

// ── Generic helpers for the SDK evolution (config / permissions / backend) ──────
function manifestOf(plugin: any): any {
  return (plugin?.manifest ?? {}) as any;
}
function configSchemaOf(plugin: any): any[] {
  const m = manifestOf(plugin);
  return Array.isArray(m.configSchema) ? m.configSchema : [];
}
function secretKeysOf(plugin: any): Set<string> {
  return new Set(configSchemaOf(plugin).filter((f: any) => f?.secret || f?.type === "secret").map((f: any) => f.key));
}
function redactSecrets(values: Record<string, unknown>, plugin: any): Record<string, unknown> {
  const secrets = secretKeysOf(plugin);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values ?? {})) out[k] = secrets.has(k) ? (v ? "***" : "") : v;
  return out;
}

/** Effective plugin permissions for a user in a workspace (instance admin ⇒ all). */
async function resolvePluginPermissions(plugin: any, user: any, workspaceId: string | null): Promise<string[]> {
  const defined: string[] = (manifestOf(plugin).definedPermissions ?? []).map((p: any) => p.key).filter(Boolean);
  if (user?.isInstanceAdmin || user?.isSuperuser) return defined;
  if (!workspaceId) return [];
  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId, memberId: user.id, isActive: true, deletedAt: null },
    select: { role: true },
  });
  const subjects: Array<{ subjectType: string; subjectId: string }> = [{ subjectType: "user", subjectId: user.id }];
  if (member) subjects.push({ subjectType: "role", subjectId: String(member.role) });
  const grants = await prisma.pluginPermissionGrant.findMany({
    where: { pluginId: plugin.id, workspaceId, OR: subjects },
    select: { permission: true },
  });
  const granted = new Set(grants.map((g) => g.permission));
  return defined.filter((p) => granted.has(p));
}

async function canAdminPlugin(plugin: any, user: any, workspaceId: string | null): Promise<boolean> {
  if (user?.isInstanceAdmin || user?.isSuperuser) return true;
  const perms = await resolvePluginPermissions(plugin, user, workspaceId);
  return perms.some((p) => p.endsWith(".admin"));
}

async function workspaceIdFromQuery(q: any): Promise<string | null> {
  const slug = q?.workspace_slug;
  if (!slug) return null;
  try {
    return (await getWorkspaceOrFail(slug)).id;
  } catch {
    return null;
  }
}

// G4 — entity external identifiers. Expose every identifier-ish field plus an
// `external_refs` map so a plugin can resolve the entity by an admin-configured
// key (e.g. external_id / legacy_id / cnpj) without anything hardcoded.
const ENTITY_SELECT = {
  id: true,
  name: true,
  workspaceId: true,
  createdAt: true,
  entityType: true,
  city: true,
  state: true,
  cnpj: true,
  email: true,
  phone: true,
  isActive: true,
  legacyId: true,
  externalSource: true,
  externalId: true,
} as const;

function serializeEntity(e: any) {
  const externalRefs: Record<string, string> = {};
  const put = (k: string, v: unknown) => {
    if (v !== null && v !== undefined && String(v).length > 0) externalRefs[k] = String(v);
  };
  put("id", e.id);
  put("external_id", e.externalId);
  put("legacy_id", e.legacyId);
  put("cnpj", e.cnpj);
  put("external_source", e.externalSource);
  return {
    id: e.id,
    name: e.name,
    entity_type: e.entityType ?? null,
    city: e.city ?? null,
    state: e.state ?? null,
    cnpj: e.cnpj ?? null,
    email: e.email ?? null,
    phone: e.phone ?? null,
    is_active: e.isActive ?? null,
    legacy_id: e.legacyId ?? null,
    external_source: e.externalSource ?? null,
    external_id: e.externalId ?? null,
    external_refs: externalRefs,
    workspace_id: e.workspaceId,
    created_at: isoDate(e.createdAt),
  };
}

// ── Plugin auth middleware ──────────────────────────────────────────────────────
// Validates that the request comes from an active plugin with the required permission.

const pluginAuthPlugin = new Elysia({ name: "plugin-auth" })
  .use(authPlugin)
  .derive({ as: "global" }, async (ctx) => {
    const pluginId = ctx.headers["x-plugin-id"];
    if (!pluginId) {
      ctx.set.status = 400;
      throw Object.assign(new Error("Missing X-Plugin-Id header."), { status: 400 });
    }
    const plugin = await prisma.plugin.findFirst({
      where: { id: pluginId, status: "ACTIVE", deletedAt: null },
    });
    if (!plugin) {
      ctx.set.status = 403;
      throw Object.assign(new Error("Plugin not found or not active."), { status: 403 });
    }
    return { plugin };
  });

function requirePermission(plugin: { permissions: string[] }, permission: string, set: any) {
  if (!plugin.permissions.includes(permission)) {
    set.status = 403;
    throw Object.assign(
      new Error(`Plugin does not have permission "${permission}".`),
      { status: 403 }
    );
  }
}

function isoDate(d: any) {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : String(d);
}

// ── Gateway module ────────────────────────────────────────────────────────────

export const pluginSdkGatewayModule = new Elysia({ prefix: "/plugin-sdk" })
  .use(
    swagger({
      path: "/plugin-docs",
      documentation: {
        info: {
          title: "Plugin SDK Gateway",
          version: "1.0.0",
          description:
            "Public gateway for plugins. All requests require X-Plugin-Id header and valid user authentication. Mirrors the Widget SDK data APIs and adds UI-surface contributions (sidebar / pages).",
        },
        tags: [
          { name: "worker-items", description: "Worker Items (Issues)" },
          { name: "intakes", description: "Intake items" },
          { name: "actions", description: "Actions" },
          { name: "stats", description: "Statistics" },
          { name: "users", description: "Users" },
          { name: "entities", description: "Entities" },
        ],
        components: {
          securitySchemes: {
            ApiKeyAuth: { type: "apiKey", in: "header", name: "X-Api-Key" },
            PluginId: { type: "apiKey", in: "header", name: "X-Plugin-Id" },
          },
        },
        security: [{ ApiKeyAuth: [], PluginId: [] }],
      },
    })
  )
  .use(pluginAuthPlugin)

  // ═══════════════════════════════════════════════════════════════════════════
  //  WORKER ITEMS API
  // ═══════════════════════════════════════════════════════════════════════════

  .get("/worker-items", async ({ query, plugin, set }) => {
    requirePermission(plugin, "worker-items.read", set);
    const q = query as any;

    const ws = q.workspace_slug ? await getWorkspaceOrFail(q.workspace_slug) : null;

    const where: any = { deletedAt: null, isDraft: false };
    if (ws) where.workspaceId = ws.id;
    if (q.entity_id) where.entityId = q.entity_id;
    if (q.status) where.state = { group: q.status };
    if (q.assignee_id) where.assignees = { some: { assigneeId: q.assignee_id } };
    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: "insensitive" } },
        { sequenceId: isNaN(Number(q.search)) ? undefined : Number(q.search) },
      ].filter((c) => Object.values(c)[0] !== undefined);
    }

    const perPage = Math.min(Number(q.limit ?? 20), 100);
    const page = Math.max(Number(q.page ?? 0), 0);

    const [items, total] = await Promise.all([
      prisma.issue.findMany({
        where,
        skip: page * perPage,
        take: perPage,
        orderBy: { updatedAt: "desc" },
        include: {
          state: { select: { id: true, name: true, group: true, color: true } },
          assignees: { include: { assignee: { select: { id: true, displayName: true, email: true } } } },
          labels: { include: { label: { select: { id: true, name: true, color: true } } } },
        },
      }),
      prisma.issue.count({ where }),
    ]);

    return {
      data: items.map((i: any) => ({
        id: i.id,
        sequence_id: i.sequenceId,
        name: i.name,
        priority: i.priority,
        state: i.state ? { id: i.state.id, name: i.state.name, group: i.state.group } : null,
        assignees: (i.assignees ?? []).map((a: any) => ({
          id: a.assignee?.id,
          display_name: a.assignee?.displayName,
          email: a.assignee?.email,
        })),
        labels: (i.labels ?? []).map((l: any) => ({ id: l.label?.id, name: l.label?.name, color: l.label?.color })),
        entity_id: i.entityId ?? null,
        created_at: isoDate(i.createdAt),
        updated_at: isoDate(i.updatedAt),
        completed_at: isoDate(i.completedAt),
      })),
      page,
      total,
      total_pages: Math.ceil(total / perPage),
    };
  })

  .get("/worker-items/stats", async ({ query, plugin, set }) => {
    requirePermission(plugin, "worker-items.read", set);
    const q = query as any;
    const where: any = { deletedAt: null, isDraft: false };
    if (q.workspace_slug) {
      const ws = await getWorkspaceOrFail(q.workspace_slug);
      where.workspaceId = ws.id;
    }
    if (q.entity_id) where.entityId = q.entity_id;

    const [total, open, closed, byPriority] = await Promise.all([
      prisma.issue.count({ where }),
      prisma.issue.count({ where: { ...where, state: { group: { in: ["backlog", "unstarted", "started"] } } } }),
      prisma.issue.count({ where: { ...where, state: { group: "completed" } } }),
      prisma.issue.groupBy({ by: ["priority"], where, _count: { id: true } }),
    ]);

    return {
      total,
      open,
      closed,
      by_priority: byPriority.reduce((acc: any, r) => {
        acc[r.priority ?? "none"] = r._count.id;
        return acc;
      }, {}),
    };
  })

  .get("/worker-items/:id", async ({ params: { id }, plugin, set }) => {
    requirePermission(plugin, "worker-items.read", set);
    const issue = await prisma.issue.findFirst({
      where: { id, deletedAt: null },
      include: {
        state: { select: { id: true, name: true, group: true, color: true } },
        assignees: { include: { assignee: { select: { id: true, displayName: true, email: true } } } },
        labels: { include: { label: { select: { id: true, name: true, color: true } } } },
      },
    });
    if (!issue) { set.status = 404; return { detail: "Worker item not found." }; }
    const i = issue as any;
    return {
      id: i.id,
      sequence_id: i.sequenceId,
      name: i.name,
      description_html: i.descriptionHtml ?? null,
      priority: i.priority,
      state: i.state ? { id: i.state.id, name: i.state.name, group: i.state.group } : null,
      assignees: (i.assignees ?? []).map((a: any) => ({ id: a.assignee?.id, display_name: a.assignee?.displayName })),
      labels: (i.labels ?? []).map((l: any) => ({ id: l.label?.id, name: l.label?.name, color: l.label?.color })),
      entity_id: i.entityId ?? null,
      project_id: i.projectId,
      workspace_id: i.workspaceId,
      created_at: isoDate(i.createdAt),
      updated_at: isoDate(i.updatedAt),
      completed_at: isoDate(i.completedAt),
    };
  })

  // ═══════════════════════════════════════════════════════════════════════════
  //  INTAKES API
  // ═══════════════════════════════════════════════════════════════════════════

  .get("/intakes", async ({ query, plugin, set }) => {
    requirePermission(plugin, "intakes.read", set);
    const q = query as any;
    const where: any = { deletedAt: null };
    if (q.workspace_slug) {
      const ws = await getWorkspaceOrFail(q.workspace_slug);
      where.workspaceId = ws.id;
    }
    if (q.project_id) where.projectId = q.project_id;
    if (q.status) where.status = Number(q.status);

    const perPage = Math.min(Number(q.limit ?? 20), 100);
    const page = Math.max(Number(q.page ?? 0), 0);

    const [items, total] = await Promise.all([
      prisma.intake.findMany({ where, skip: page * perPage, take: perPage, orderBy: { createdAt: "desc" } }),
      prisma.intake.count({ where }),
    ]);

    return {
      data: items.map((i: any) => ({
        id: i.id,
        name: i.name,
        description: i.description ?? null,
        project_id: i.projectId,
        workspace_id: i.workspaceId,
        created_at: isoDate(i.createdAt),
        updated_at: isoDate(i.updatedAt),
      })),
      page,
      total,
      total_pages: Math.ceil(total / perPage),
    };
  })

  .get("/intakes/stats", async ({ query, plugin, set }) => {
    requirePermission(plugin, "intakes.read", set);
    const q = query as any;
    const where: any = { deletedAt: null };
    if (q.workspace_slug) {
      const ws = await getWorkspaceOrFail(q.workspace_slug);
      where.workspaceId = ws.id;
    }
    const total = await prisma.intake.count({ where });
    return { total };
  })

  .get("/intakes/:id", async ({ params: { id }, plugin, set }) => {
    requirePermission(plugin, "intakes.read", set);
    const intake = await prisma.intake.findFirst({ where: { id, deletedAt: null } });
    if (!intake) { set.status = 404; return { detail: "Intake not found." }; }
    const i = intake as any;
    return {
      id: i.id,
      name: i.name,
      description: i.description ?? null,
      project_id: i.projectId,
      workspace_id: i.workspaceId,
      created_at: isoDate(i.createdAt),
      updated_at: isoDate(i.updatedAt),
    };
  })

  // ═══════════════════════════════════════════════════════════════════════════
  //  ACTIONS API  (uses Issues as the action model)
  // ═══════════════════════════════════════════════════════════════════════════

  .get("/actions", async ({ query, plugin, set }) => {
    requirePermission(plugin, "actions.read", set);
    const q = query as any;
    const where: any = { deletedAt: null, isDraft: false };
    if (q.workspace_slug) {
      const ws = await getWorkspaceOrFail(q.workspace_slug);
      where.workspaceId = ws.id;
    }
    if (q.entity_id) where.entityId = q.entity_id;
    if (q.assignee_id) where.assignees = { some: { assigneeId: q.assignee_id } };

    const perPage = Math.min(Number(q.limit ?? 20), 100);
    const page = Math.max(Number(q.page ?? 0), 0);

    const [items, total] = await Promise.all([
      prisma.issue.findMany({
        where,
        skip: page * perPage,
        take: perPage,
        orderBy: { updatedAt: "desc" },
        include: { state: { select: { id: true, name: true, group: true } } },
      }),
      prisma.issue.count({ where }),
    ]);

    return {
      data: items.map((i: any) => ({
        id: i.id,
        name: i.name,
        priority: i.priority,
        state: i.state ? { id: i.state.id, name: i.state.name, group: i.state.group } : null,
        entity_id: i.entityId ?? null,
        created_at: isoDate(i.createdAt),
        updated_at: isoDate(i.updatedAt),
      })),
      page,
      total,
      total_pages: Math.ceil(total / perPage),
    };
  })

  .get("/actions/stats", async ({ query, plugin, set }) => {
    requirePermission(plugin, "actions.read", set);
    const q = query as any;
    const where: any = { deletedAt: null, isDraft: false };
    if (q.workspace_slug) {
      const ws = await getWorkspaceOrFail(q.workspace_slug);
      where.workspaceId = ws.id;
    }
    const [total, open, closed] = await Promise.all([
      prisma.issue.count({ where }),
      prisma.issue.count({ where: { ...where, state: { group: { in: ["backlog", "unstarted", "started"] } } } }),
      prisma.issue.count({ where: { ...where, state: { group: "completed" } } }),
    ]);
    return { total, open, closed };
  })

  .get("/actions/:id", async ({ params: { id }, plugin, set }) => {
    requirePermission(plugin, "actions.read", set);
    const issue = await prisma.issue.findFirst({
      where: { id, deletedAt: null },
      include: { state: { select: { id: true, name: true, group: true } } },
    });
    if (!issue) { set.status = 404; return { detail: "Action not found." }; }
    const i = issue as any;
    return {
      id: i.id,
      name: i.name,
      priority: i.priority,
      state: i.state ? { id: i.state.id, name: i.state.name, group: i.state.group } : null,
      entity_id: i.entityId ?? null,
      created_at: isoDate(i.createdAt),
      updated_at: isoDate(i.updatedAt),
    };
  })

  // ═══════════════════════════════════════════════════════════════════════════
  //  STATS API
  // ═══════════════════════════════════════════════════════════════════════════

  .get("/stats/overview", async ({ query, plugin, set }) => {
    requirePermission(plugin, "stats.read", set);
    const q = query as any;
    const where: any = { deletedAt: null, isDraft: false };
    const intakeWhere: any = { deletedAt: null };
    if (q.workspace_slug) {
      const ws = await getWorkspaceOrFail(q.workspace_slug);
      where.workspaceId = ws.id;
      intakeWhere.workspaceId = ws.id;
    }

    const [workerItemsTotal, workerItemsOpen, workerItemsClosed, intakesTotal, actionsTotal] =
      await Promise.all([
        prisma.issue.count({ where }),
        prisma.issue.count({ where: { ...where, state: { group: { in: ["backlog", "unstarted", "started"] } } } }),
        prisma.issue.count({ where: { ...where, state: { group: "completed" } } }),
        prisma.intake.count({ where: intakeWhere }),
        prisma.issue.count({ where }),
      ]);

    return {
      worker_items_total: workerItemsTotal,
      worker_items_open: workerItemsOpen,
      worker_items_closed: workerItemsClosed,
      intakes_total: intakesTotal,
      actions_total: actionsTotal,
    };
  })

  .get("/stats/period", async ({ query, plugin, set }) => {
    requirePermission(plugin, "stats.read", set);
    const q = query as any;
    if (!q.start_date || !q.end_date) {
      set.status = 400;
      return { detail: "start_date and end_date are required." };
    }
    const where: any = {
      deletedAt: null,
      isDraft: false,
      createdAt: { gte: new Date(q.start_date), lte: new Date(q.end_date) },
    };
    if (q.workspace_slug) {
      const ws = await getWorkspaceOrFail(q.workspace_slug);
      where.workspaceId = ws.id;
    }
    const [created, completed] = await Promise.all([
      prisma.issue.count({ where }),
      prisma.issue.count({ where: { ...where, completedAt: { not: null } } }),
    ]);
    return {
      start_date: q.start_date,
      end_date: q.end_date,
      worker_items_created: created,
      worker_items_completed: completed,
    };
  })

  .get("/stats/entity/:entity_id", async ({ params: { entity_id }, plugin, set }) => {
    requirePermission(plugin, "stats.read", set);
    const where = { deletedAt: null, isDraft: false, entityId: entity_id };
    const [total, open, closed] = await Promise.all([
      prisma.issue.count({ where }),
      prisma.issue.count({ where: { ...where, state: { group: { in: ["backlog", "unstarted", "started"] } } } }),
      prisma.issue.count({ where: { ...where, state: { group: "completed" } } }),
    ]);
    return { entity_id, total, open, closed };
  })

  // ═══════════════════════════════════════════════════════════════════════════
  //  USERS API
  // ═══════════════════════════════════════════════════════════════════════════

  .get("/users/me", async ({ user, plugin, set }) => {
    requirePermission(plugin, "users.read", set);
    const u = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, displayName: true, firstName: true, lastName: true, avatarUrl: true },
    });
    if (!u) { set.status = 404; return { detail: "User not found." }; }
    return {
      id: u.id,
      email: u.email,
      display_name: u.displayName,
      first_name: (u as any).firstName ?? "",
      last_name: (u as any).lastName ?? "",
      avatar_url: (u as any).avatarUrl ?? null,
    };
  })

  .get("/users", async ({ query, plugin, set }) => {
    requirePermission(plugin, "users.read", set);
    const q = query as any;
    const where: any = { isActive: true, deletedAt: null };
    if (q.search) {
      where.OR = [
        { email: { contains: q.search, mode: "insensitive" } },
        { displayName: { contains: q.search, mode: "insensitive" } },
      ];
    }
    const perPage = Math.min(Number(q.limit ?? 20), 100);
    const page = Math.max(Number(q.page ?? 0), 0);

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: page * perPage,
        take: perPage,
        orderBy: { displayName: "asc" },
        select: { id: true, email: true, displayName: true, avatarUrl: true },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      data: users.map((u) => ({
        id: u.id,
        email: u.email,
        display_name: u.displayName,
        avatar_url: (u as any).avatarUrl ?? null,
      })),
      page,
      total,
      total_pages: Math.ceil(total / perPage),
    };
  })

  .get("/users/:id", async ({ params: { id }, plugin, set }) => {
    requirePermission(plugin, "users.read", set);
    const u = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, displayName: true, avatarUrl: true },
    });
    if (!u) { set.status = 404; return { detail: "User not found." }; }
    return { id: u.id, email: u.email, display_name: u.displayName, avatar_url: (u as any).avatarUrl ?? null };
  })

  // ═══════════════════════════════════════════════════════════════════════════
  //  ENTITIES API
  // ═══════════════════════════════════════════════════════════════════════════

  .get("/entities", async ({ query, plugin, set }) => {
    requirePermission(plugin, "entities.read", set);
    const q = query as any;
    const where: any = { deletedAt: null };
    if (q.workspace_slug) {
      const ws = await getWorkspaceOrFail(q.workspace_slug);
      where.workspaceId = ws.id;
    }
    if (q.search) where.name = { contains: q.search, mode: "insensitive" };

    const perPage = Math.min(Number(q.limit ?? 20), 100);
    const page = Math.max(Number(q.page ?? 0), 0);

    const [entities, total] = await Promise.all([
      prisma.entity.findMany({
        where,
        skip: page * perPage,
        take: perPage,
        orderBy: { name: "asc" },
        select: ENTITY_SELECT,
      }),
      prisma.entity.count({ where }),
    ]);

    return {
      data: entities.map(serializeEntity),
      page,
      total,
      total_pages: Math.ceil(total / perPage),
    };
  })

  .get("/entities/:id", async ({ params: { id }, plugin, set }) => {
    requirePermission(plugin, "entities.read", set);
    const entity = await prisma.entity.findFirst({
      where: { id, deletedAt: null },
      select: ENTITY_SELECT,
    });
    if (!entity) { set.status = 404; return { detail: "Entity not found." }; }
    return serializeEntity(entity);
  })

  // ═══════════════════════════════════════════════════════════════════════════
  //  G1 — INSTANCE CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════

  .get("/config/schema", async ({ plugin }) => configSchemaOf(plugin))

  .get("/config", async ({ query, plugin, set }) => {
    const q = query as any;
    const scope = q.scope === "instance" ? "instance" : "workspace";
    let scopeId: string | null = null;
    if (scope === "workspace") {
      scopeId = await workspaceIdFromQuery(q);
      if (!scopeId) { set.status = 400; return { detail: "workspace_slug is required for workspace scope." }; }
    }
    const row = await prisma.pluginConfig.findFirst({ where: { pluginId: plugin.id, scope, scopeId } });
    const defaults: Record<string, unknown> = {};
    for (const f of configSchemaOf(plugin)) if (f?.default !== undefined) defaults[f.key] = f.default;
    const values = { ...defaults, ...(((row?.value as any) ?? {}) as Record<string, unknown>) };
    return redactSecrets(values, plugin);
  })

  .put("/config", async ({ query, body, plugin, user, set }) => {
    const b = (body as any) ?? {};
    const scope = b.scope === "instance" ? "instance" : "workspace";
    let scopeId: string | null = null;
    if (scope === "workspace") {
      scopeId = await workspaceIdFromQuery({ workspace_slug: b.workspace_slug ?? (query as any).workspace_slug });
      if (!scopeId) { set.status = 400; return { detail: "workspace_slug is required for workspace scope." }; }
    }
    if (!(await canAdminPlugin(plugin, user, scopeId))) {
      set.status = 403;
      return { detail: "Only admins can change plugin configuration." };
    }
    const incoming = (b.values ?? {}) as Record<string, unknown>;
    const existing = await prisma.pluginConfig.findFirst({ where: { pluginId: plugin.id, scope, scopeId } });
    const merged: Record<string, unknown> = { ...(((existing?.value as any) ?? {}) as Record<string, unknown>) };
    const secrets = secretKeysOf(plugin);
    for (const [k, v] of Object.entries(incoming)) {
      // Keep the stored secret when the client sends the redaction placeholder / empty.
      if (secrets.has(k) && (v === "***" || v === "" || v == null)) continue;
      merged[k] = v;
    }
    if (existing) {
      await prisma.pluginConfig.update({ where: { id: existing.id }, data: { value: merged as any, updatedById: user.id } });
    } else {
      await prisma.pluginConfig.create({ data: { pluginId: plugin.id, scope, scopeId, value: merged as any, updatedById: user.id } });
    }
    return { ok: true };
  })

  // ═══════════════════════════════════════════════════════════════════════════
  //  G2 — CUSTOM PERMISSIONS
  // ═══════════════════════════════════════════════════════════════════════════

  .get("/me/permissions", async ({ query, plugin, user }) => {
    const workspaceId = await workspaceIdFromQuery(query as any);
    return resolvePluginPermissions(plugin, user, workspaceId);
  })

  // ═══════════════════════════════════════════════════════════════════════════
  //  G3 — AUTHENTICATED PROXY TO THE PLUGIN'S OWN BACKEND
  // ═══════════════════════════════════════════════════════════════════════════
  //  ALL /backend/* → forwards to manifest.backend.baseUrl with signed identity
  //  headers. The browser never learns the backend URL/secrets. JSON & empty
  //  bodies are fully supported; large multipart streaming is refined in a later
  //  phase (or via the verifiable-token path).
  .all("/backend/*", async ({ plugin, user, params, query, body, request, set }) => {
    const backend = manifestOf(plugin).backend;
    if (!backend?.baseUrl) { set.status = 400; return { detail: "Plugin has no backend configured." }; }

    const subPath = "/" + String((params as any)["*"] ?? "").replace(/^\/+/, "");
    const workspaceId = await workspaceIdFromQuery(query as any);
    const perms = await resolvePluginPermissions(plugin, user, workspaceId);

    const url = new URL(backend.baseUrl + subPath);
    for (const [k, v] of Object.entries((query as any) ?? {})) if (v != null) url.searchParams.set(k, String(v));

    const method = request.method.toUpperCase();
    let bodyBuf: Buffer | undefined;
    if (method !== "GET" && method !== "HEAD") {
      if (typeof body === "string") bodyBuf = Buffer.from(body);
      else if (body && typeof body === "object") bodyBuf = Buffer.from(JSON.stringify(body));
      else {
        try { bodyBuf = Buffer.from(await request.arrayBuffer()); } catch { bodyBuf = undefined; }
      }
    }

    const ts = Date.now().toString();
    const bodyHash = createHash("sha256").update(bodyBuf ?? Buffer.alloc(0)).digest("hex");
    const pluginKey = createHmac("sha256", BRIDGE_SECRET).update(plugin.id).digest("hex");
    const sigBase = [method, subPath, user.id, workspaceId ?? "", ts, bodyHash].join("|");
    const signature = createHmac("sha256", pluginKey).update(sigBase).digest("hex");
    const correlationId = request.headers.get("x-correlation-id") ?? randomUUID();

    const fwdHeaders: Record<string, string> = {
      "X-Plugin-Id": plugin.id,
      "X-Plugin-User": user.id,
      "X-Plugin-User-Name": user.displayName ?? "",
      "X-Plugin-User-Email": user.email ?? "",
      "X-Plugin-Workspace": workspaceId ?? "",
      "X-Plugin-Perms": perms.join(","),
      "X-Plugin-Timestamp": ts,
      "X-Plugin-Signature": signature,
      "X-Correlation-Id": correlationId,
    };
    const contentType = request.headers.get("content-type");
    if (contentType && bodyBuf) fwdHeaders["content-type"] = contentType;

    let resp: Response;
    try {
      resp = await fetch(url.toString(), { method, headers: fwdHeaders, body: bodyBuf });
    } catch {
      set.status = 502;
      return { detail: "Plugin backend unreachable." };
    }

    const outHeaders: Record<string, string> = {};
    resp.headers.forEach((v, k) => {
      if (!["transfer-encoding", "content-encoding", "connection", "content-length"].includes(k.toLowerCase())) outHeaders[k] = v;
    });
    outHeaders["X-Correlation-Id"] = correlationId;
    return new Response(resp.body, { status: resp.status, headers: outHeaders });
  });
