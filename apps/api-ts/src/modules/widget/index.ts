import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";
import { widgetStorage } from "@utils/widget-storage";
import { extractWidgetZip } from "@utils/widget-zip";
import { validateManifest } from "@utils/widget-manifest";
import { checkRateLimit } from "@utils/rate-limiter";

function auditLog(action: string, userId: string, widgetId?: string, meta?: Record<string, unknown>) {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    source: "widget-module",
    action,
    user_id: userId,
    widget_id: widgetId ?? null,
    ...meta,
  }));
}

const ALLOWED_BUNDLE_MIME = new Set([
  "application/javascript",
  "text/javascript",
  "application/octet-stream",
]);

function validateBundleMime(file: Blob) {
  const mime = (file as any).type as string | undefined;
  if (mime && !ALLOWED_BUNDLE_MIME.has(mime.split(";")[0].trim())) {
    throw Object.assign(
      new Error(`Invalid bundle MIME type "${mime}". Expected application/javascript.`),
      { status: 400 }
    );
  }
}

function requireInstanceAdmin(user: { isInstanceAdmin: boolean; isSuperuser: boolean }, set: any) {
  if (!user.isInstanceAdmin && !user.isSuperuser) {
    set.status = 403;
    throw Object.assign(new Error("Only instance admins can manage widgets."), { status: 403 });
  }
}

function serializeWidget(w: any) {
  return {
    id: w.id,
    name: w.name,
    description: w.description ?? null,
    version: w.version,
    author: w.author,
    entry_file: w.entryFile,
    manifest: w.manifest,
    permissions: w.permissions,
    status: w.status,
    storage_key: w.storageKey,
    created_by: w.createdById ?? null,
    created_at: w.createdAt?.toISOString(),
    updated_at: w.updatedAt?.toISOString(),
  };
}

export const widgetModule = new Elysia({ prefix: "/widgets" })
  .use(authPlugin)

  // ── Upload widget (multipart ZIP) ────────────────────────────────────────────
  .post("/", async ({ body, user, set, request }) => {
    requireInstanceAdmin(user, set);

    // Rate limit: 5 uploads per minute per user
    const ip = request.headers.get("x-forwarded-for") ?? user.id;
    if (!checkRateLimit(`widget-upload:${user.id}:${ip}`, 5, 60_000)) {
      set.status = 429;
      return { detail: "Too many upload requests. Please wait before trying again." };
    }

    const file: Blob | null = (body as any).file ?? null;
    if (!file) {
      set.status = 400;
      return { detail: "Multipart field 'file' (widget.zip) is required." };
    }

    const zipBuffer = Buffer.from(await file.arrayBuffer());
    const { manifest: rawManifest, entryBuffer, entryFilename } = extractWidgetZip(zipBuffer);
    const manifest = validateManifest(rawManifest);

    // Conflict check: same name + version
    const existing = await prisma.widget.findFirst({
      where: { name: manifest.name, version: manifest.version, deletedAt: null },
    });
    if (existing) {
      set.status = 409;
      return { detail: `Widget "${manifest.name}" version ${manifest.version} already exists.` };
    }

    // Persist bundle to storage
    const storageKey = `${manifest.name.toLowerCase().replace(/\s+/g, "-")}/${manifest.version}/${entryFilename}`;
    await widgetStorage.put(storageKey, entryBuffer);

    const widget = await prisma.$transaction(async (tx) => {
      const w = await tx.widget.create({
        data: {
          name: manifest.name,
          description: manifest.description || null,
          version: manifest.version,
          author: manifest.author,
          entryFile: entryFilename,
          manifest: rawManifest as any,
          permissions: manifest.permissions,
          status: "PENDING_APPROVAL",
          storageKey,
          createdById: user.id,
        },
      });
      await tx.widgetVersion.create({
        data: {
          widgetId: w.id,
          version: manifest.version,
          storageKey,
          manifest: rawManifest as any,
        },
      });
      return w;
    });

    auditLog("widget.upload", user.id, widget.id, { name: widget.name, version: widget.version });
    set.status = 201;
    return serializeWidget(widget);
  })

  // ── List widgets ─────────────────────────────────────────────────────────────
  .get("/", async ({ query, user }) => {
    const q = query as any;
    const where: any = { deletedAt: null };
    if (q.name) where.name = { contains: q.name, mode: "insensitive" };
    if (q.author) where.author = { contains: q.author, mode: "insensitive" };
    if (q.status) where.status = q.status;
    if (q.version) where.version = q.version;

    return paginate({
      query: (skip, take) =>
        prisma.widget.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      count: () => prisma.widget.count({ where }),
      cursor: q.cursor as string | undefined,
      transform: (items) => items.map(serializeWidget),
    });
  })

  // ── Get widget by ID ─────────────────────────────────────────────────────────
  .get("/:id", async ({ params: { id }, set }) => {
    const widget = await prisma.widget.findFirst({ where: { id, deletedAt: null } });
    if (!widget) { set.status = 404; return { detail: "Widget not found." }; }
    return serializeWidget(widget);
  })

  // ── Update metadata ──────────────────────────────────────────────────────────
  .put("/:id", async ({ params: { id }, body, user, set }) => {
    requireInstanceAdmin(user, set);
    const b = body as any;
    const widget = await prisma.widget.findFirst({ where: { id, deletedAt: null } });
    if (!widget) { set.status = 404; return { detail: "Widget not found." }; }

    const data: any = {};
    if (b.name !== undefined) data.name = String(b.name).trim().slice(0, 255);
    if (b.description !== undefined) data.description = b.description;

    const updated = await prisma.widget.update({ where: { id }, data });
    return serializeWidget(updated);
  })

  // ── Activate ─────────────────────────────────────────────────────────────────
  .post("/:id/activate", async ({ params: { id }, user, set }) => {
    requireInstanceAdmin(user, set);
    const widget = await prisma.widget.findFirst({ where: { id, deletedAt: null } });
    if (!widget) { set.status = 404; return { detail: "Widget not found." }; }
    auditLog("widget.activate", user.id, id);
    const updated = await prisma.widget.update({ where: { id }, data: { status: "ACTIVE" } });
    return serializeWidget(updated);
  })

  // ── Deactivate ────────────────────────────────────────────────────────────────
  .post("/:id/deactivate", async ({ params: { id }, user, set }) => {
    requireInstanceAdmin(user, set);
    const widget = await prisma.widget.findFirst({ where: { id, deletedAt: null } });
    if (!widget) { set.status = 404; return { detail: "Widget not found." }; }
    auditLog("widget.deactivate", user.id, id);
    const updated = await prisma.widget.update({ where: { id }, data: { status: "INACTIVE" } });
    return serializeWidget(updated);
  })

  // ── Soft delete ───────────────────────────────────────────────────────────────
  .delete("/:id", async ({ params: { id }, user, set }) => {
    requireInstanceAdmin(user, set);
    const widget = await prisma.widget.findFirst({ where: { id, deletedAt: null } });
    if (!widget) { set.status = 404; return { detail: "Widget not found." }; }
    auditLog("widget.delete", user.id, id);
    await prisma.widget.update({
      where: { id },
      data: { deletedAt: new Date(), status: "ARCHIVED" },
    });
    set.status = 204;
    return null;
  })

  // ── Serve bundle asset ────────────────────────────────────────────────────────
  .get("/:id/assets/*", async ({ params, set, request }) => {
    const id = (params as any).id as string;
    const wildcard = (params as any)["*"] as string;

    const widget = await prisma.widget.findFirst({ where: { id, deletedAt: null } });
    if (!widget) { set.status = 404; return { detail: "Widget not found." }; }
    if (widget.status !== "ACTIVE") { set.status = 403; return { detail: "Widget is not active." }; }

    const key = wildcard ? `${widget.storageKey.split("/").slice(0, -1).join("/")}/${wildcard}` : widget.storageKey;

    let buffer: Buffer;
    try {
      buffer = await widgetStorage.get(widget.storageKey);
    } catch {
      set.status = 404;
      return { detail: "Asset not found." };
    }

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/javascript",
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  })

  // ── List versions ─────────────────────────────────────────────────────────────
  .get("/:id/versions", async ({ params: { id }, set }) => {
    const widget = await prisma.widget.findFirst({ where: { id, deletedAt: null } });
    if (!widget) { set.status = 404; return { detail: "Widget not found." }; }
    const versions = await prisma.widgetVersion.findMany({
      where: { widgetId: id },
      orderBy: { createdAt: "desc" },
    });
    return versions.map((v) => ({
      id: v.id,
      version: v.version,
      storage_key: v.storageKey,
      manifest: v.manifest,
      changelog: v.changelog ?? null,
      created_at: v.createdAt?.toISOString(),
    }));
  });
