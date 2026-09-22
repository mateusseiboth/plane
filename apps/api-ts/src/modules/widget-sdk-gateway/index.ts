import Elysia from "elysia";
import { swagger } from "@elysiajs/swagger";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
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
import { requireSdkGatewayScope } from "@utils/sdk-gateway-scope";

// ── Widget auth middleware ─────────────────────────────────────────────────────
// Validates that the request comes from an active widget with the required permission.

// `scoped`, não `global`: o derive global vazava para todo módulo montado depois
// no src/index.ts e exigia X-Widget-Id até nas rotas do gateway de plugin.
const widgetAuthPlugin = new Elysia({ name: "widget-auth" }).use(authPlugin).derive({ as: "scoped" }, async (ctx) => {
  const widgetId = ctx.headers["x-widget-id"];
  if (!widgetId) {
    ctx.set.status = 400;
    throw Object.assign(new Error("Cabeçalho X-Widget-Id ausente."), { status: 400 });
  }
  const widget = await prisma.widget.findFirst({
    where: { id: widgetId, status: "ACTIVE", deletedAt: null },
  });
  if (!widget) {
    ctx.set.status = 403;
    throw Object.assign(new Error("Widget não encontrado ou inativo."), { status: 403 });
  }
  return { widget };
});

function requirePermission(widget: { permissions: string[] }, permission: string, set: any) {
  if (!widget.permissions.includes(permission)) {
    set.status = 403;
    throw Object.assign(new Error(`O widget não possui a permissão "${permission}".`), { status: 403 });
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

// Contrato de entidade do widget (mais enxuto que o do plugin, que expõe ids externos).
const ENTITY_CONTRACT = {
  select: { id: true, name: true, workspaceId: true, createdAt: true, entityType: true, city: true, state: true },
  serialize: (e: any) => ({
    id: e.id,
    name: e.name,
    entity_type: e.entityType ?? null,
    city: e.city ?? null,
    state: e.state ?? null,
    workspace_id: e.workspaceId,
    created_at: isoDate(e.createdAt),
  }),
};

// ── Gateway module ────────────────────────────────────────────────────────────

export const widgetSdkGatewayModule = new Elysia({ prefix: "/widget-sdk" })
  .use(
    swagger({
      path: "/docs",
      documentation: {
        info: {
          title: "Widget SDK Gateway",
          version: "1.0.0",
          description:
            "Public gateway for widgets. All requests require X-Widget-Id header and valid user authentication.",
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
            WidgetId: { type: "apiKey", in: "header", name: "X-Widget-Id" },
          },
        },
        security: [{ ApiKeyAuth: [], WidgetId: [] }],
      },
    })
  )
  .use(widgetAuthPlugin)

  // ═══════════════════════════════════════════════════════════════════════════
  //  DATA APIs — todas exigem workspace_slug + membro (@utils/sdk-gateway-scope)
  // ═══════════════════════════════════════════════════════════════════════════

  .get("/worker-items", async ({ query, user, widget, set }) => {
    requirePermission(widget, "worker-items.read", set);
    return findWorkerItems(await requireSdkGatewayScope(query, user.id), query as any);
  })

  .get("/worker-items/stats", async ({ query, user, widget, set }) => {
    requirePermission(widget, "worker-items.read", set);
    return getWorkerItemStats(await requireSdkGatewayScope(query, user.id), query as any);
  })

  .get("/worker-items/:id", async ({ params: { id }, query, user, widget, set }) => {
    requirePermission(widget, "worker-items.read", set);
    const item = await findWorkerItem(await requireSdkGatewayScope(query, user.id), id);
    return item ?? respondNotFound(set, "Chamado não encontrado.");
  })

  .get("/intakes", async ({ query, user, widget, set }) => {
    requirePermission(widget, "intakes.read", set);
    return findIntakes(await requireSdkGatewayScope(query, user.id), query as any);
  })

  .get("/intakes/stats", async ({ query, user, widget, set }) => {
    requirePermission(widget, "intakes.read", set);
    return getIntakeStats(await requireSdkGatewayScope(query, user.id));
  })

  .get("/intakes/:id", async ({ params: { id }, query, user, widget, set }) => {
    requirePermission(widget, "intakes.read", set);
    const intake = await findIntake(await requireSdkGatewayScope(query, user.id), id);
    return intake ?? respondNotFound(set, "Solicitação não encontrada.");
  })

  .get("/actions", async ({ query, user, widget, set }) => {
    requirePermission(widget, "actions.read", set);
    return findActions(await requireSdkGatewayScope(query, user.id), query as any);
  })

  .get("/actions/stats", async ({ query, user, widget, set }) => {
    requirePermission(widget, "actions.read", set);
    return getActionStats(await requireSdkGatewayScope(query, user.id));
  })

  .get("/actions/:id", async ({ params: { id }, query, user, widget, set }) => {
    requirePermission(widget, "actions.read", set);
    const action = await findAction(await requireSdkGatewayScope(query, user.id), id);
    return action ?? respondNotFound(set, "Ação não encontrada.");
  })

  .get("/stats/overview", async ({ query, user, widget, set }) => {
    requirePermission(widget, "stats.read", set);
    return getStatsOverview(await requireSdkGatewayScope(query, user.id));
  })

  .get("/stats/period", async ({ query, user, widget, set }) => {
    requirePermission(widget, "stats.read", set);
    const q = query as any;
    const scope = await requireSdkGatewayScope(q, user.id);
    if (!q.start_date || !q.end_date) {
      set.status = 400;
      return { detail: "start_date e end_date são obrigatórios." };
    }
    return getPeriodStats(scope, q.start_date, q.end_date);
  })

  .get("/stats/entity/:entity_id", async ({ params: { entity_id }, query, user, widget, set }) => {
    requirePermission(widget, "stats.read", set);
    return getEntityStats(await requireSdkGatewayScope(query, user.id), entity_id);
  })

  // O próprio usuário não depende de workspace.
  .get("/users/me", async ({ user, widget, set }) => {
    requirePermission(widget, "users.read", set);
    return (await findCurrentUser(user.id)) ?? respondNotFound(set, "Usuário não encontrado.");
  })

  .get("/users", async ({ query, user, widget, set }) => {
    requirePermission(widget, "users.read", set);
    return findUsers(await requireSdkGatewayScope(query, user.id), query as any);
  })

  .get("/users/:id", async ({ params: { id }, query, user, widget, set }) => {
    requirePermission(widget, "users.read", set);
    const found = await findUser(await requireSdkGatewayScope(query, user.id), id);
    return found ?? respondNotFound(set, "Usuário não encontrado.");
  })

  .get("/entities", async ({ query, user, widget, set }) => {
    requirePermission(widget, "entities.read", set);
    return findEntities(await requireSdkGatewayScope(query, user.id), query as any, ENTITY_CONTRACT);
  })

  .get("/entities/:id", async ({ params: { id }, query, user, widget, set }) => {
    requirePermission(widget, "entities.read", set);
    const entity = await findEntity(await requireSdkGatewayScope(query, user.id), id, ENTITY_CONTRACT);
    return entity ?? respondNotFound(set, "Entidade não encontrada.");
  });
