/**
 * Custom Webhook Integration Module
 *
 * Provides CRUD for custom webhooks + a receiver endpoint that executes
 * user-supplied JavaScript when an external system POSTs to the webhook URL.
 *
 * Only workspace ADMIN (role 20) can manage custom webhooks.
 *
 * JS execution model:
 *  - User writes an `async function action() { ... }` body.
 *  - The runtime injects `body`, `headers`, `sourceIp`, `executePrismaAction`, `makeLog`
 *    into the execution context.
 *  - `makeLog()` MUST be called at the end (also automatically called on error).
 *  - `executePrismaAction({ table, operation, data?, options? })` for DB access.
 *  - Dynamic `await import('node:crypto')` etc. are allowed for built-in modules.
 */
import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { getWorkspaceOrFail, requireWorkspaceMember } from "@utils/workspace";
import crypto from "node:crypto";

// ── Allowed tables (same whitelist as custom-widget) ─────────────────────────
const ALLOWED_TABLES = new Set([
  "issue", "issueComment", "technicalVisit", "entity", "project",
  "state", "label", "cycle", "module", "intakeIssue", "issueActivity",
  "customWebhookAuditLog",
]);

const BLOCKED_FIELDS = new Set([
  "password", "apiKey", "apiTokenHash", "token", "refreshToken",
]);

function sanitizeWhere(where: any, workspaceId: string): any {
  if (!where || typeof where !== "object") return { workspaceId };
  const safe: Record<string, any> = {};
  for (const [k, v] of Object.entries(where)) {
    if (BLOCKED_FIELDS.has(k) || k === "workspaceId") continue;
    safe[k] = v;
  }
  return { workspaceId, ...safe };
}

function sanitizeData(data: any): any {
  if (!data || typeof data !== "object") return {};
  const safe: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (BLOCKED_FIELDS.has(k)) continue;
    safe[k] = v;
  }
  return safe;
}

// ── executePrismaAction implementation ────────────────────────────────────────

function makePrismaExecutor(workspaceId: string) {
  return async function executePrismaAction({
    table,
    operation,
    data,
    options,
  }: {
    table: string;
    operation: "retrieve" | "insert" | "update" | "delete";
    data?: Record<string, any>;
    options?: {
      where?: Record<string, any>;
      select?: Record<string, any>;
      orderBy?: Record<string, any>;
      take?: number;
      id?: string;
    };
  }): Promise<any> {
    if (!ALLOWED_TABLES.has(table)) {
      throw new Error(`Table "${table}" is not allowed.`);
    }
    const accessor = (prisma as any)[table];
    if (!accessor) throw new Error(`Table "${table}" not found in Prisma client.`);

    switch (operation) {
      case "retrieve":
        return accessor.findMany({
          where: sanitizeWhere(options?.where, workspaceId),
          select: options?.select ?? undefined,
          orderBy: options?.orderBy ?? { createdAt: "desc" },
          take: Math.min(options?.take ?? 50, 500),
        });

      case "insert":
        if (!data) throw new Error("data is required for insert");
        return accessor.create({
          data: { ...sanitizeData(data), workspaceId },
        });

      case "update": {
        if (!data) throw new Error("data is required for update");
        const safeData = sanitizeData(data);
        if (options?.id) {
          return accessor.update({ where: { id: options.id }, data: safeData });
        }
        return accessor.updateMany({
          where: sanitizeWhere(options?.where, workspaceId),
          data: safeData,
        });
      }

      case "delete": {
        // Always soft-delete via deletedAt
        if (options?.id) {
          return accessor.update({
            where: { id: options.id },
            data: { deletedAt: new Date() },
          });
        }
        return accessor.updateMany({
          where: sanitizeWhere(options?.where, workspaceId),
          data: { deletedAt: new Date() },
        });
      }

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  };
}

// ── JS executor ───────────────────────────────────────────────────────────────

async function runWebhookCode(
  jsCode: string,
  context: {
    body: any;
    headers: Record<string, string>;
    sourceIp: string;
    workspaceId: string;
    webhookId: string;
  }
): Promise<{ status: "success" | "error"; error?: string; executionMs: number }> {
  const start = Date.now();
  let logCalled = false;

  const executePrismaAction = makePrismaExecutor(context.workspaceId);

  async function makeLog(extra?: { status?: string; error?: string }) {
    logCalled = true;
    await prisma.customWebhookAuditLog.create({
      data: {
        webhookId: context.webhookId,
        workspaceId: context.workspaceId,
        sourceIp: context.sourceIp,
        body: JSON.stringify(context.body).slice(0, 10_000),
        headers: JSON.stringify(context.headers).slice(0, 2_000),
        status: extra?.status ?? "success",
        error: extra?.error ?? null,
        executionMs: Date.now() - start,
      },
    });
  }

  // Allow dynamic import of safe built-in modules only
  async function importModule(specifier: string): Promise<any> {
    const SAFE_BUILTINS = new Set([
      "node:crypto", "crypto", "node:url", "url", "node:path", "path",
      "node:util", "util", "node:querystring", "querystring",
    ]);
    if (!SAFE_BUILTINS.has(specifier)) {
      throw new Error(`Import of "${specifier}" is not allowed. Only Node.js built-in modules are permitted.`);
    }
    return import(specifier);
  }

  try {
    // Build the executable function: inject globals then call action()
    const wrappedCode = `
      "use strict";
      ${jsCode}
      return action();
    `;

    // Use AsyncFunction so await works at top level inside action()
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction(
      "body", "headers", "sourceIp",
      "executePrismaAction", "makeLog", "importModule",
      wrappedCode
    );

    await fn(
      context.body,
      context.headers,
      context.sourceIp,
      executePrismaAction,
      makeLog,
      importModule
    );

    // Always ensure makeLog is called
    if (!logCalled) await makeLog({ status: "success" });

    return { status: "success", executionMs: Date.now() - start };
  } catch (err: any) {
    const errMsg = err?.message ?? String(err);
    if (!logCalled) {
      try {
        await makeLog({ status: "error", error: errMsg });
      } catch { /* best effort */ }
    }
    return { status: "error", error: errMsg, executionMs: Date.now() - start };
  }
}

// ── Elysia module ─────────────────────────────────────────────────────────────

export const customWebhookModule = new Elysia()
  .use(authPlugin)

  // ── CRUD (ADMIN only) ───────────────────────────────────────────────────────

  .get("/workspaces/:slug/custom-webhooks/", async ({ params: { slug }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId: ws.id, memberId: user.id, deletedAt: null },
    });
    if (!member || member.role < 20) { set.status = 403; return { detail: "Apenas administradores podem gerenciar integrações customizadas." }; }

    const hooks = await prisma.customWebhook.findMany({
      where: { workspaceId: ws.id, deletedAt: null },
      select: { id: true, name: true, description: true, isActive: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "desc" },
    });
    return { results: hooks };
  })

  .post("/workspaces/:slug/custom-webhooks/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId: ws.id, memberId: user.id, deletedAt: null },
    });
    if (!member || member.role < 20) { set.status = 403; return { detail: "Apenas administradores podem criar integrações customizadas." }; }

    const b = body as any;
    if (!b.name || !b.js_code) { set.status = 400; return { detail: "name e js_code são obrigatórios." }; }

    const secret = crypto.randomBytes(24).toString("hex");
    const hook = await prisma.customWebhook.create({
      data: {
        workspaceId: ws.id, createdById: user.id,
        name: b.name, description: b.description ?? "",
        jsCode: b.js_code, isActive: b.is_active ?? true,
        secret,
      },
    });
    set.status = 201;
    return {
      id: hook.id, name: hook.name, description: hook.description,
      is_active: hook.isActive, secret: hook.secret,
      receive_url: `/api/webhooks/receive/${slug}/${hook.id}/`,
      created_at: hook.createdAt?.toISOString(),
    };
  })

  .get("/workspaces/:slug/custom-webhooks/:hook_id/", async ({ params: { slug, hook_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId: ws.id, memberId: user.id, deletedAt: null },
    });
    if (!member || member.role < 20) { set.status = 403; return { detail: "Apenas administradores." }; }

    const hook = await prisma.customWebhook.findFirst({
      where: { id: hook_id, workspaceId: ws.id, deletedAt: null },
    });
    if (!hook) { set.status = 404; return { detail: "Not found." }; }

    return {
      id: hook.id, name: hook.name, description: hook.description,
      is_active: hook.isActive, js_code: hook.jsCode, secret: hook.secret,
      receive_url: `/api/webhooks/receive/${slug}/${hook.id}/`,
      created_at: hook.createdAt?.toISOString(),
      updated_at: hook.updatedAt?.toISOString(),
    };
  })

  .patch("/workspaces/:slug/custom-webhooks/:hook_id/", async ({ params: { slug, hook_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId: ws.id, memberId: user.id, deletedAt: null },
    });
    if (!member || member.role < 20) { set.status = 403; return { detail: "Apenas administradores." }; }

    const b = body as any;
    const data: any = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.description !== undefined) data.description = b.description;
    if (b.js_code !== undefined) data.jsCode = b.js_code;
    if (b.is_active !== undefined) data.isActive = b.is_active;

    const hook = await prisma.customWebhook.update({
      where: { id: hook_id },
      data,
    });
    return { id: hook.id, name: hook.name, is_active: hook.isActive, updated_at: hook.updatedAt?.toISOString() };
  })

  .delete("/workspaces/:slug/custom-webhooks/:hook_id/", async ({ params: { slug, hook_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId: ws.id, memberId: user.id, deletedAt: null },
    });
    if (!member || member.role < 20) { set.status = 403; return { detail: "Apenas administradores." }; }

    await prisma.customWebhook.update({ where: { id: hook_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // ── Audit log ────────────────────────────────────────────────────────────────

  .get("/workspaces/:slug/custom-webhooks/:hook_id/logs/", async ({ params: { slug, hook_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId: ws.id, memberId: user.id, deletedAt: null },
    });
    if (!member || member.role < 20) { set.status = 403; return { detail: "Apenas administradores." }; }

    const logs = await prisma.customWebhookAuditLog.findMany({
      where: { webhookId: hook_id, workspaceId: ws.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { results: logs.map((l: any) => ({
      id: l.id, status: l.status, source_ip: l.sourceIp,
      execution_ms: l.executionMs, error: l.error,
      created_at: l.createdAt?.toISOString(),
    })) };
  })

  // ── Public receiver — no auth required (webhook comes from external systems) ─

  .post("/webhooks/receive/:slug/:hook_id/", async ({ params: { slug, hook_id }, body, request, set }) => {
    // Find workspace and hook
    const ws = await prisma.workspace.findFirst({ where: { slug, deletedAt: null } });
    if (!ws) { set.status = 404; return { detail: "Workspace not found." }; }

    const hook = await prisma.customWebhook.findFirst({
      where: { id: hook_id, workspaceId: ws.id, deletedAt: null, isActive: true },
    });
    if (!hook) { set.status = 404; return { detail: "Webhook not found or inactive." }; }

    // Optional signature verification (HMAC-SHA256)
    const sig = request.headers.get("x-webhook-signature") ?? request.headers.get("x-hub-signature-256");
    if (sig && hook.secret) {
      const payload = typeof body === "string" ? body : JSON.stringify(body);
      const expected = "sha256=" + crypto.createHmac("sha256", hook.secret).update(payload).digest("hex");
      if (sig !== expected) {
        set.status = 401;
        return { detail: "Invalid webhook signature." };
      }
    }

    // Gather headers as plain object
    const headers: Record<string, string> = {};
    request.headers.forEach((v, k) => { headers[k] = v; });

    const sourceIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";

    // Execute user code asynchronously (fire-and-forget is acceptable, but we await here for the response)
    const result = await runWebhookCode(hook.jsCode, {
      body,
      headers,
      sourceIp,
      workspaceId: ws.id,
      webhookId: hook.id,
    });

    if (result.status === "error") {
      set.status = 500;
      return { received: true, status: "error", error: result.error, execution_ms: result.executionMs };
    }

    return { received: true, status: "success", execution_ms: result.executionMs };
  });
