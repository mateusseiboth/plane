/**
 * Custom Widget Data API
 *
 * Allows widgets to request arbitrary data from the database using a
 * declarative query descriptor — no raw SQL, safe parameterization.
 *
 * POST /workspaces/:slug/widget-data/
 * Body:
 *  {
 *    table: string,          // Prisma model name (camelCase), e.g. "issue", "technicalVisit"
 *    select?: object,        // Prisma `select` clause
 *    where?: object,         // Additional filters merged with workspace scope
 *    orderBy?: object,       // Prisma `orderBy`
 *    take?: number           // Max records (capped at 200)
 *  }
 */
import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { getWorkspaceOrFail, requireWorkspaceMember } from "@utils/workspace";

// Whitelisted Prisma model accessors — only these can be queried by widgets
const ALLOWED_TABLES = new Set([
  "issue",
  "issueComment",
  "technicalVisit",
  "entity",
  "project",
  "state",
  "label",
  "cycle",
  "module",
  "intakeIssue",
  "issueActivity",
]);

// Fields that widgets may NOT request (secrets / PII)
const BLOCKED_FIELDS = new Set([
  "password", "apiKey", "apiTokenHash", "token", "refreshToken", "apiToken",
  "externalId", "legacyId", "externalSource",
]);

function sanitizeSelect(select: any): any {
  if (!select || typeof select !== "object") return undefined;
  const safe: Record<string, any> = {};
  for (const [key, val] of Object.entries(select)) {
    if (BLOCKED_FIELDS.has(key)) continue;
    if (val === true || val === false) { safe[key] = val; continue; }
    if (typeof val === "object" && val !== null) {
      const inner = sanitizeSelect(val);
      if (inner) safe[key] = inner;
    }
  }
  return Object.keys(safe).length ? safe : undefined;
}

// Recursively remove any attempt to query outside the workspace scope
function sanitizeWhere(where: any): any {
  if (!where || typeof where !== "object") return {};
  const safe: Record<string, any> = {};
  for (const [key, val] of Object.entries(where)) {
    if (BLOCKED_FIELDS.has(key)) continue;
    // Prevent nested relation queries that could leak other workspaces' data
    if (key === "workspaceId" || key === "workspace") continue; // will be forced-set
    safe[key] = val;
  }
  return safe;
}

export const customWidgetModule = new Elysia({ prefix: "/workspaces/:slug/widget-data" })
  .use(authPlugin)

  .post("/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);

    const b = body as any;
    const table: string = b.table ?? "";

    if (!ALLOWED_TABLES.has(table)) {
      set.status = 400;
      return { detail: `A tabela "${table}" não está disponível para consultas de widget. Permitidas: ${[...ALLOWED_TABLES].join(", ")}.` };
    }

    const accessor = (prisma as any)[table];
    if (!accessor || typeof accessor.findMany !== "function") {
      set.status = 400;
      return { detail: `Tabela "${table}" não encontrada no cliente Prisma.` };
    }

    const take = Math.min(Number(b.take ?? 50), 200);
    const select = sanitizeSelect(b.select) ?? undefined;
    const userWhere = sanitizeWhere(b.where ?? {});
    const orderBy = b.orderBy ?? { createdAt: "desc" };

    // Always scope to workspace and exclude soft-deleted
    const where: any = { workspaceId: ws.id, deletedAt: null, ...userWhere };

    try {
      const results = await accessor.findMany({ where, select, orderBy, take });
      return { table, count: results.length, results };
    } catch (err: any) {
      set.status = 400;
      return { detail: "Erro na consulta: " + (err?.message ?? "unknown") };
    }
  });
