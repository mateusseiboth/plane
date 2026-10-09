import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import { widgetDao } from "@modules/widget/widget.dao";
import { ENVIOS_POR_MINUTO, serializeWidget } from "@modules/widget/widget.rules";
import { createWidgetService } from "@modules/widget/widget.service";
import { widgetStorage } from "@utils/widget-storage";
import { checkRateLimit } from "@utils/rate-limiter";
import { isUploader, requireUploader } from "@utils/registry-access";

const widgets = createWidgetService({ dao: widgetDao, storage: widgetStorage, isUploader });

function auditLog(action: string, userId: string, widgetId?: string, meta?: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      source: "widget-module",
      action,
      user_id: userId,
      widget_id: widgetId ?? null,
      ...meta,
    })
  );
}

function requireInstanceAdmin(user: { isInstanceAdmin: boolean; isSuperuser: boolean }, set: any) {
  if (!user.isInstanceAdmin && !user.isSuperuser) {
    set.status = 403;
    throw Object.assign(new Error("Apenas administradores da instância podem gerenciar widgets."), { status: 403 });
  }
}

/** Limite de envios por minuto por pessoa, valendo para o global e para o "meu". */
const isEnvioLiberado = (userId: string, request: Request) =>
  checkRateLimit(
    `widget-upload:${userId}:${request.headers.get("x-forwarded-for") ?? userId}`,
    ENVIOS_POR_MINUTO,
    60_000
  );

/** O `.zip` do campo multipart `file`, ou null quando não veio. */
async function readZipDoCorpo(body: unknown): Promise<Buffer | null> {
  const file: Blob | null = (body as any)?.file ?? null;
  if (!file) return null;
  return Buffer.from(await file.arrayBuffer());
}

const ENVIO_LIMITADO = { detail: "Muitas solicitações de envio. Aguarde antes de tentar novamente." };
const SEM_ARQUIVO = { detail: "O campo multipart 'file' (widget.zip) é obrigatório." };

export const widgetModule = new Elysia({ prefix: "/widgets" })
  .use(authPlugin)

  // ── Upload global (multipart ZIP): admin da instância, superusuário ou TI ────
  .post("/", async ({ body, user, set, request }) => {
    await requireUploader(user, set);
    if (!isEnvioLiberado(user.id, request)) {
      set.status = 429;
      return ENVIO_LIMITADO;
    }
    const zip = await readZipDoCorpo(body);
    if (!zip) {
      set.status = 400;
      return SEM_ARQUIVO;
    }
    const widget = await widgets.upload(zip, user, null);
    auditLog("widget.upload", user.id, widget.id, { name: widget.name, version: widget.version });
    set.status = 201;
    return widget;
  })

  // ── Meus widgets: qualquer membro ativo; aparecem só na home de quem enviou ──
  .post("/mine/", async ({ body, user, set, request }) => {
    await widgets.requireMembroAtivo(user);
    if (!isEnvioLiberado(user.id, request)) {
      set.status = 429;
      return ENVIO_LIMITADO;
    }
    const zip = await readZipDoCorpo(body);
    if (!zip) {
      set.status = 400;
      return SEM_ARQUIVO;
    }
    const widget = await widgets.upload(zip, user, user.id);
    auditLog("widget.upload_mine", user.id, widget.id, { name: widget.name, version: widget.version });
    set.status = 201;
    return widget;
  })

  .get("/mine/", ({ query, user }) => widgets.listMine(user, (query as any).cursor))

  .delete("/mine/:id/", async ({ params: { id }, user, set }) => {
    await widgets.removeMine(id, user);
    auditLog("widget.delete_mine", user.id, id);
    set.status = 204;
    return null;
  })

  // ── Listagem: home (globais + os meus), ?scope=global ou ?scope=users (admin) ─
  .get("/", ({ query, user }) => widgets.listByEscopo(query as any, user))

  // ── Tornar global um widget de usuário (mesma regra do uploader) ─────────────
  .post("/:id/make-global/", async ({ params: { id }, user }) => {
    const widget = await widgets.makeGlobal(id, user);
    auditLog("widget.make_global", user.id, id, { name: widget.name, version: widget.version });
    return widget;
  })

  // ── Get widget by ID ─────────────────────────────────────────────────────────
  .get("/:id", async ({ params: { id }, user }) => serializeWidget(await widgets.findVisivel(id, user)))

  // ── Update metadata ──────────────────────────────────────────────────────────
  .put("/:id", async ({ params: { id }, body, user, set }) => {
    requireInstanceAdmin(user, set);
    await widgets.findVisivel(id, user);
    const b = body as any;
    const data: Record<string, unknown> = {};
    if (b.name !== undefined) data.name = String(b.name).trim().slice(0, 255);
    if (b.description !== undefined) data.description = b.description;
    return serializeWidget(await widgetDao.update(id, data));
  })

  // ── Activate ─────────────────────────────────────────────────────────────────
  .post("/:id/activate", async ({ params: { id }, user, set }) => {
    requireInstanceAdmin(user, set);
    await widgets.findVisivel(id, user);
    auditLog("widget.activate", user.id, id);
    return serializeWidget(await widgetDao.update(id, { status: "ACTIVE" }));
  })

  // ── Deactivate ────────────────────────────────────────────────────────────────
  .post("/:id/deactivate", async ({ params: { id }, user, set }) => {
    requireInstanceAdmin(user, set);
    await widgets.findVisivel(id, user);
    auditLog("widget.deactivate", user.id, id);
    return serializeWidget(await widgetDao.update(id, { status: "INACTIVE" }));
  })

  // ── Soft delete (tela de administração) ──────────────────────────────────────
  .delete("/:id", async ({ params: { id }, user, set }) => {
    await widgets.removeComoAdmin(id, user);
    auditLog("widget.delete", user.id, id);
    set.status = 204;
    return null;
  })

  // ── Serve bundle asset ────────────────────────────────────────────────────────
  .get("/:id/assets/*", async ({ params, user, set }) => {
    const widget = await widgets.findVisivel((params as any).id as string, user);
    if (widget.status !== "ACTIVE") {
      set.status = 403;
      return { detail: "O widget não está ativo." };
    }

    let buffer: Buffer;
    try {
      buffer = await widgetStorage.get(widget.storageKey);
    } catch {
      set.status = 404;
      return { detail: "Arquivo não encontrado." };
    }

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/javascript",
        // O pacote de um widget privado não pode ficar em cache compartilhado.
        "Cache-Control": widget.ownerUserId ? "private, max-age=3600" : "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  })

  // ── List versions ─────────────────────────────────────────────────────────────
  .get("/:id/versions", async ({ params: { id }, user }) => {
    await widgets.findVisivel(id, user);
    const versions = await widgetDao.findVersoes(id);
    return versions.map((v) => ({
      id: v.id,
      version: v.version,
      storage_key: v.storageKey,
      manifest: v.manifest,
      changelog: v.changelog ?? null,
      created_at: v.createdAt?.toISOString(),
    }));
  });
