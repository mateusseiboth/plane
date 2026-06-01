import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";
import { pluginStorage } from "@utils/plugin-storage";
import { extractPluginZip } from "@utils/plugin-zip";
import { validatePluginManifest } from "@utils/plugin-manifest";
import { checkRateLimit } from "@utils/rate-limiter";

function auditLog(action: string, userId: string, pluginId?: string, meta?: Record<string, unknown>) {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    source: "plugin-module",
    action,
    user_id: userId,
    plugin_id: pluginId ?? null,
    ...meta,
  }));
}

function requireInstanceAdmin(user: { isInstanceAdmin: boolean; isSuperuser: boolean }, set: any) {
  if (!user.isInstanceAdmin && !user.isSuperuser) {
    set.status = 403;
    throw Object.assign(new Error("Only instance admins can manage plugins."), { status: 403 });
  }
}

function contentTypeFor(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js":
    case "mjs":
      return "application/javascript";
    case "css":
      return "text/css";
    case "json":
      return "application/json";
    case "svg":
      return "image/svg+xml";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "woff":
      return "font/woff";
    case "woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

function serializePlugin(p: any) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description ?? null,
    version: p.version,
    author: p.author,
    entry_file: p.entryFile,
    manifest: p.manifest,
    permissions: p.permissions,
    contributions: p.contributions ?? { sidebar: [], pages: [] },
    status: p.status,
    storage_key: p.storageKey,
    created_by: p.createdById ?? null,
    created_at: p.createdAt?.toISOString(),
    updated_at: p.updatedAt?.toISOString(),
  };
}

export const pluginRegistryModule = new Elysia({ prefix: "/plugins" })
  .use(authPlugin)

  // ── Upload plugin (multipart ZIP) ────────────────────────────────────────────
  .post("/", async ({ body, user, set, request }) => {
    requireInstanceAdmin(user, set);

    // Rate limit: 5 uploads per minute per user
    const ip = request.headers.get("x-forwarded-for") ?? user.id;
    if (!checkRateLimit(`plugin-upload:${user.id}:${ip}`, 5, 60_000)) {
      set.status = 429;
      return { detail: "Too many upload requests. Please wait before trying again." };
    }

    const file: Blob | null = (body as any).file ?? null;
    if (!file) {
      set.status = 400;
      return { detail: "Multipart field 'file' (plugin.zip) is required." };
    }

    const zipBuffer = Buffer.from(await file.arrayBuffer());
    const { manifest: rawManifest, entryBuffer, entryFilename, files } = extractPluginZip(zipBuffer);
    const manifest = validatePluginManifest(rawManifest);

    // Conflict check: same slug + version
    const existing = await prisma.plugin.findFirst({
      where: { slug: manifest.slug, version: manifest.version, deletedAt: null },
    });
    if (existing) {
      set.status = 409;
      return { detail: `Plugin "${manifest.slug}" version ${manifest.version} already exists.` };
    }

    // Persist entry bundle + every additional asset bundled in the ZIP.
    const baseDir = `${manifest.slug}/${manifest.version}`;
    const storageKey = `${baseDir}/${entryFilename}`;
    await pluginStorage.put(storageKey, entryBuffer);
    for (const [name, buf] of Object.entries(files)) {
      if (name === entryFilename) continue;
      await pluginStorage.put(`${baseDir}/${name}`, buf);
    }

    const plugin = await prisma.$transaction(async (tx) => {
      const p = await tx.plugin.create({
        data: {
          name: manifest.name,
          slug: manifest.slug,
          description: manifest.description || null,
          version: manifest.version,
          author: manifest.author,
          entryFile: entryFilename,
          manifest: rawManifest as any,
          permissions: manifest.permissions,
          contributions: manifest.contributions as any,
          status: "PENDING_APPROVAL",
          storageKey,
          createdById: user.id,
        },
      });
      await tx.pluginVersion.create({
        data: {
          pluginId: p.id,
          version: manifest.version,
          storageKey,
          manifest: rawManifest as any,
          contributions: manifest.contributions as any,
        },
      });
      return p;
    });

    auditLog("plugin.upload", user.id, plugin.id, { slug: plugin.slug, version: plugin.version });
    set.status = 201;
    return serializePlugin(plugin);
  })

  // ── List plugins ─────────────────────────────────────────────────────────────
  .get("/", async ({ query }) => {
    const q = query as any;
    const where: any = { deletedAt: null };
    if (q.name) where.name = { contains: q.name, mode: "insensitive" };
    if (q.author) where.author = { contains: q.author, mode: "insensitive" };
    if (q.status) where.status = q.status;
    if (q.version) where.version = q.version;

    return paginate({
      query: (skip, take) =>
        prisma.plugin.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      count: () => prisma.plugin.count({ where }),
      cursor: q.cursor as string | undefined,
      transform: (items) => items.map(serializePlugin),
    });
  })

  // ── Active plugins (for the host UI: sidebar + routing) ───────────────────────
  // Public to any authenticated user — returns only what the UI needs to render.
  .get("/active", async () => {
    const plugins = await prisma.plugin.findMany({
      where: { status: "ACTIVE", deletedAt: null },
      orderBy: { name: "asc" },
    });
    return {
      results: plugins.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        version: p.version,
        entry_file: p.entryFile,
        permissions: p.permissions,
        contributions: (p.contributions as any) ?? { sidebar: [], pages: [] },
      })),
    };
  })

  // ── Get plugin by ID ─────────────────────────────────────────────────────────
  .get("/:id", async ({ params: { id }, set }) => {
    const plugin = await prisma.plugin.findFirst({ where: { id, deletedAt: null } });
    if (!plugin) { set.status = 404; return { detail: "Plugin not found." }; }
    return serializePlugin(plugin);
  })

  // ── Update metadata ──────────────────────────────────────────────────────────
  .put("/:id", async ({ params: { id }, body, user, set }) => {
    requireInstanceAdmin(user, set);
    const b = body as any;
    const plugin = await prisma.plugin.findFirst({ where: { id, deletedAt: null } });
    if (!plugin) { set.status = 404; return { detail: "Plugin not found." }; }

    const data: any = {};
    if (b.name !== undefined) data.name = String(b.name).trim().slice(0, 255);
    if (b.description !== undefined) data.description = b.description;

    const updated = await prisma.plugin.update({ where: { id }, data });
    return serializePlugin(updated);
  })

  // ── Activate ─────────────────────────────────────────────────────────────────
  .post("/:id/activate", async ({ params: { id }, user, set }) => {
    requireInstanceAdmin(user, set);
    const plugin = await prisma.plugin.findFirst({ where: { id, deletedAt: null } });
    if (!plugin) { set.status = 404; return { detail: "Plugin not found." }; }
    auditLog("plugin.activate", user.id, id);
    const updated = await prisma.plugin.update({ where: { id }, data: { status: "ACTIVE" } });
    return serializePlugin(updated);
  })

  // ── Deactivate ────────────────────────────────────────────────────────────────
  .post("/:id/deactivate", async ({ params: { id }, user, set }) => {
    requireInstanceAdmin(user, set);
    const plugin = await prisma.plugin.findFirst({ where: { id, deletedAt: null } });
    if (!plugin) { set.status = 404; return { detail: "Plugin not found." }; }
    auditLog("plugin.deactivate", user.id, id);
    const updated = await prisma.plugin.update({ where: { id }, data: { status: "INACTIVE" } });
    return serializePlugin(updated);
  })

  // ── Soft delete ───────────────────────────────────────────────────────────────
  .delete("/:id", async ({ params: { id }, user, set }) => {
    requireInstanceAdmin(user, set);
    const plugin = await prisma.plugin.findFirst({ where: { id, deletedAt: null } });
    if (!plugin) { set.status = 404; return { detail: "Plugin not found." }; }
    auditLog("plugin.delete", user.id, id);
    await prisma.plugin.update({
      where: { id },
      data: { deletedAt: new Date(), status: "ARCHIVED" },
    });
    set.status = 204;
    return null;
  })

  // ── Serve bundle / asset ────────────────────────────────────────────────────
  .get("/:id/assets/*", async ({ params, set }) => {
    const id = (params as any).id as string;
    const wildcard = (params as any)["*"] as string;

    const plugin = await prisma.plugin.findFirst({ where: { id, deletedAt: null } });
    if (!plugin) { set.status = 404; return { detail: "Plugin not found." }; }
    if (plugin.status !== "ACTIVE") { set.status = 403; return { detail: "Plugin is not active." }; }

    const baseDir = plugin.storageKey.split("/").slice(0, -1).join("/");
    // Guard against path traversal in the wildcard segment.
    const requested = (wildcard || plugin.entryFile).replace(/\.\.(\/|\\|$)/g, "");
    const key = `${baseDir}/${requested}`;

    let buffer: Buffer;
    try {
      buffer = await pluginStorage.get(key);
    } catch {
      set.status = 404;
      return { detail: "Asset not found." };
    }

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentTypeFor(requested),
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  })

  // ── List versions ─────────────────────────────────────────────────────────────
  .get("/:id/versions", async ({ params: { id }, set }) => {
    const plugin = await prisma.plugin.findFirst({ where: { id, deletedAt: null } });
    if (!plugin) { set.status = 404; return { detail: "Plugin not found." }; }
    const versions = await prisma.pluginVersion.findMany({
      where: { pluginId: id },
      orderBy: { createdAt: "desc" },
    });
    return versions.map((v) => ({
      id: v.id,
      version: v.version,
      storage_key: v.storageKey,
      manifest: v.manifest,
      contributions: v.contributions,
      changelog: v.changelog ?? null,
      created_at: v.createdAt?.toISOString(),
    }));
  });
