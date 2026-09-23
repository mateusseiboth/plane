import Elysia from "elysia";
import { swagger } from "@elysiajs/swagger";
import { createHmac, createHash, randomUUID } from "crypto";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { readBridgeSecret } from "@modules/plugin-sdk-gateway/bridge-secret";
import { buildProxyResponseHeaders, isRespostaEmFluxo } from "@utils/proxy-response";
import { EProjectAction, hasWorkspaceAction } from "@utils/permission-checks";
import {
  findAction,
  findActions,
  findCurrentUser,
  findEntities,
  findEntity,
  findIntake,
  findIntakes,
  findUser,
  findUsers,
  findWorkerItem,
  findWorkerItems,
  getActionStats,
  getEntityStats,
  getIntakeStats,
  getPeriodStats,
  getStatsOverview,
  getWorkerItemStats,
} from "@utils/sdk-gateway-data";
import {
  readWorkspaceSlug,
  requireMemberWorkspaceId,
  requireSdkGatewayScope,
  resolveOptionalWorkspaceId,
} from "@utils/sdk-gateway-scope";

// ── Generic helpers for the SDK evolution (config / permissions / backend) ──────
function manifestOf(plugin: any): any {
  return (plugin?.manifest ?? {}) as any;
}
function configSchemaOf(plugin: any): any[] {
  const m = manifestOf(plugin);
  return Array.isArray(m.configSchema) ? m.configSchema : [];
}
function secretKeysOf(plugin: any): Set<string> {
  return new Set(
    configSchemaOf(plugin)
      .filter((f: any) => f?.secret || f?.type === "secret")
      .map((f: any) => f.key)
  );
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
  // Quem gerencia plugins na tela de Configurações também configura o plugin:
  // sem isto o admin do espaço abriria o formulário e tomaria 403 ao salvar.
  if (workspaceId && (await hasWorkspaceAction(workspaceId, user.id, EProjectAction.PLUGIN_MANAGE))) return true;
  const perms = await resolvePluginPermissions(plugin, user, workspaceId);
  return perms.some((p) => p.endsWith(".admin"));
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

// `scoped`, não `global`: o derive global vazava para todo módulo montado depois
// no src/index.ts. O do widget (montado antes) exigia X-Widget-Id até nas rotas
// deste gateway, que respondiam 400 "Cabeçalho X-Widget-Id ausente." para plugin.
const pluginAuthPlugin = new Elysia({ name: "plugin-auth" }).use(authPlugin).derive({ as: "scoped" }, async (ctx) => {
  const pluginId = ctx.headers["x-plugin-id"];
  if (!pluginId) {
    ctx.set.status = 400;
    throw Object.assign(new Error("Cabeçalho X-Plugin-Id ausente."), { status: 400 });
  }
  const plugin = await prisma.plugin.findFirst({
    where: { id: pluginId, status: "ACTIVE", deletedAt: null },
  });
  if (!plugin) {
    ctx.set.status = 403;
    throw Object.assign(new Error("Plugin não encontrado ou inativo."), { status: 403 });
  }
  return { plugin };
});

function requirePermission(plugin: { permissions: string[] }, permission: string, set: any) {
  if (!plugin.permissions.includes(permission)) {
    set.status = 403;
    throw Object.assign(new Error(`O plugin não possui a permissão "${permission}".`), { status: 403 });
  }
}

function isoDate(d: any) {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : String(d);
}

function respondNotFound(set: any, detail: string) {
  set.status = 404;
  return { detail };
}

const ENTITY_CONTRACT = { select: ENTITY_SELECT, serialize: serializeEntity };

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
  //  DATA APIs — todas exigem workspace_slug + membro (@utils/sdk-gateway-scope)
  // ═══════════════════════════════════════════════════════════════════════════

  .get("/worker-items", async ({ query, user, plugin, set }) => {
    requirePermission(plugin, "worker-items.read", set);
    return findWorkerItems(await requireSdkGatewayScope(query, user.id), query as any);
  })

  .get("/worker-items/stats", async ({ query, user, plugin, set }) => {
    requirePermission(plugin, "worker-items.read", set);
    return getWorkerItemStats(await requireSdkGatewayScope(query, user.id), query as any);
  })

  .get("/worker-items/:id", async ({ params: { id }, query, user, plugin, set }) => {
    requirePermission(plugin, "worker-items.read", set);
    const item = await findWorkerItem(await requireSdkGatewayScope(query, user.id), id);
    return item ?? respondNotFound(set, "Chamado não encontrado.");
  })

  .get("/intakes", async ({ query, user, plugin, set }) => {
    requirePermission(plugin, "intakes.read", set);
    return findIntakes(await requireSdkGatewayScope(query, user.id), query as any);
  })

  .get("/intakes/stats", async ({ query, user, plugin, set }) => {
    requirePermission(plugin, "intakes.read", set);
    return getIntakeStats(await requireSdkGatewayScope(query, user.id));
  })

  .get("/intakes/:id", async ({ params: { id }, query, user, plugin, set }) => {
    requirePermission(plugin, "intakes.read", set);
    const intake = await findIntake(await requireSdkGatewayScope(query, user.id), id);
    return intake ?? respondNotFound(set, "Solicitação não encontrada.");
  })

  .get("/actions", async ({ query, user, plugin, set }) => {
    requirePermission(plugin, "actions.read", set);
    return findActions(await requireSdkGatewayScope(query, user.id), query as any);
  })

  .get("/actions/stats", async ({ query, user, plugin, set }) => {
    requirePermission(plugin, "actions.read", set);
    return getActionStats(await requireSdkGatewayScope(query, user.id));
  })

  .get("/actions/:id", async ({ params: { id }, query, user, plugin, set }) => {
    requirePermission(plugin, "actions.read", set);
    const action = await findAction(await requireSdkGatewayScope(query, user.id), id);
    return action ?? respondNotFound(set, "Ação não encontrada.");
  })

  .get("/stats/overview", async ({ query, user, plugin, set }) => {
    requirePermission(plugin, "stats.read", set);
    return getStatsOverview(await requireSdkGatewayScope(query, user.id));
  })

  .get("/stats/period", async ({ query, user, plugin, set }) => {
    requirePermission(plugin, "stats.read", set);
    const q = query as any;
    const scope = await requireSdkGatewayScope(q, user.id);
    if (!q.start_date || !q.end_date) {
      set.status = 400;
      return { detail: "start_date e end_date são obrigatórios." };
    }
    return getPeriodStats(scope, q.start_date, q.end_date);
  })

  .get("/stats/entity/:entity_id", async ({ params: { entity_id }, query, user, plugin, set }) => {
    requirePermission(plugin, "stats.read", set);
    return getEntityStats(await requireSdkGatewayScope(query, user.id), entity_id);
  })

  // O próprio usuário não depende de workspace.
  .get("/users/me", async ({ user, plugin, set }) => {
    requirePermission(plugin, "users.read", set);
    return (await findCurrentUser(user.id)) ?? respondNotFound(set, "Usuário não encontrado.");
  })

  .get("/users", async ({ query, user, plugin, set }) => {
    requirePermission(plugin, "users.read", set);
    return findUsers(await requireSdkGatewayScope(query, user.id), query as any);
  })

  .get("/users/:id", async ({ params: { id }, query, user, plugin, set }) => {
    requirePermission(plugin, "users.read", set);
    const found = await findUser(await requireSdkGatewayScope(query, user.id), id);
    return found ?? respondNotFound(set, "Usuário não encontrado.");
  })

  .get("/entities", async ({ query, user, plugin, set }) => {
    requirePermission(plugin, "entities.read", set);
    return findEntities(await requireSdkGatewayScope(query, user.id), query as any, ENTITY_CONTRACT);
  })

  .get("/entities/:id", async ({ params: { id }, query, user, plugin, set }) => {
    requirePermission(plugin, "entities.read", set);
    const entity = await findEntity(await requireSdkGatewayScope(query, user.id), id, ENTITY_CONTRACT);
    return entity ?? respondNotFound(set, "Entidade não encontrada.");
  })

  // ═══════════════════════════════════════════════════════════════════════════
  //  G1 — INSTANCE CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════

  .get("/config/schema", async ({ plugin }) => configSchemaOf(plugin))

  .get("/config", async ({ query, plugin, user }) => {
    const q = query as any;
    const scope = q.scope === "instance" ? "instance" : "workspace";
    let scopeId: string | null = null;
    if (scope === "workspace") {
      scopeId = await requireMemberWorkspaceId(readWorkspaceSlug(q), user.id);
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
      const slug = readWorkspaceSlug({ workspace_slug: b.workspace_slug ?? (query as any).workspace_slug });
      scopeId = await requireMemberWorkspaceId(slug, user.id);
    }
    if (!(await canAdminPlugin(plugin, user, scopeId))) {
      set.status = 403;
      return { detail: "Apenas administradores podem alterar a configuração do plugin." };
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
      await prisma.pluginConfig.update({
        where: { id: existing.id },
        data: { value: merged as any, updatedById: user.id },
      });
    } else {
      await prisma.pluginConfig.create({
        data: { pluginId: plugin.id, scope, scopeId, value: merged as any, updatedById: user.id },
      });
    }
    return { ok: true };
  })

  // ═══════════════════════════════════════════════════════════════════════════
  //  G2 — CUSTOM PERMISSIONS
  // ═══════════════════════════════════════════════════════════════════════════

  .get("/me/permissions", async ({ query, plugin, user }) => {
    const workspaceId = await resolveOptionalWorkspaceId(query, user.id);
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
    if (!backend?.baseUrl) {
      set.status = 400;
      return { detail: "O plugin não possui backend configurado." };
    }

    // Workspace alheio é 403: sem isso o proxy assinaria X-Plugin-Workspace de
    // um workspace de que o usuário não participa, e o backend confiaria nele.
    const workspaceId = await resolveOptionalWorkspaceId(query, user.id);

    const bridgeSecret = readBridgeSecret();
    if (!bridgeSecret) {
      console.error(
        "[plugin-sdk] PLUGIN_BRIDGE_SECRET não configurado: o proxy para o backend do plugin está desligado."
      );
      set.status = 503;
      return { detail: "A integração deste plugin está indisponível. Avise o administrador do sistema." };
    }

    const subPath = "/" + String((params as any)["*"] ?? "").replace(/^\/+/, "");
    const perms = await resolvePluginPermissions(plugin, user, workspaceId);

    const url = new URL(backend.baseUrl + subPath);
    for (const [k, v] of Object.entries((query as any) ?? {})) if (v != null) url.searchParams.set(k, String(v));

    const method = request.method.toUpperCase();
    let bodyBuf: Buffer | undefined;
    if (method !== "GET" && method !== "HEAD") {
      if (typeof body === "string") bodyBuf = Buffer.from(body);
      else if (body && typeof body === "object") bodyBuf = Buffer.from(JSON.stringify(body));
      else {
        try {
          bodyBuf = Buffer.from(await request.arrayBuffer());
        } catch {
          bodyBuf = undefined;
        }
      }
    }

    const ts = Date.now().toString();
    const bodyHash = createHash("sha256")
      .update(bodyBuf ?? Buffer.alloc(0))
      .digest("hex");
    const pluginKey = createHmac("sha256", bridgeSecret).update(plugin.id).digest("hex");
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
      resp = await fetch(url.toString(), {
        method,
        headers: fwdHeaders,
        body: bodyBuf ? new Uint8Array(bodyBuf) : undefined,
      });
    } catch {
      set.status = 502;
      return { detail: "Backend do plugin inacessível." };
    }

    const outHeaders = buildProxyResponseHeaders(resp.headers, correlationId);
    // SSE segue em fluxo; o resto vai com tamanho conhecido (ver utils/proxy-response).
    if (isRespostaEmFluxo(resp.headers.get("content-type")))
      return new Response(resp.body, { status: resp.status, headers: outHeaders });
    return new Response(await resp.arrayBuffer(), { status: resp.status, headers: outHeaders });
  });
