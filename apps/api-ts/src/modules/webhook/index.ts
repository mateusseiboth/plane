import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";
import { getWorkspaceOrFail, requireWorkspaceWriter } from "@utils/workspace";
import { randomBytes } from "crypto";

export const webhookModule = new Elysia({ prefix: "/workspaces/:slug/webhooks" })
  .use(authPlugin)

  .get("/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const where = { workspaceId: ws.id, deletedAt: null };
    return paginate({
      query: (skip, take) => prisma.webhook.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      count: () => prisma.webhook.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const b = body as any;
    if (!b.url) { set.status = 400; return { detail: "A URL é obrigatória." }; }

    const webhook = await prisma.webhook.create({
      data: {
        workspaceId: ws.id,
        url: b.url,
        secret: randomBytes(32).toString("hex"),
        isActive: b.is_active ?? true,
        events: b.events ?? [],
        createdById: user.id,
      },
    });
    set.status = 201;
    return webhook;
  })

  .get("/:webhook_id/", async ({ params: { slug, webhook_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    return prisma.webhook.findFirstOrThrow({ where: { id: webhook_id, workspaceId: ws.id, deletedAt: null } });
  })

  .patch("/:webhook_id/", async ({ params: { slug, webhook_id }, body, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const b = body as any;
    const data: any = {};
    if (b.url !== undefined) data.url = b.url;
    if (b.is_active !== undefined) data.isActive = b.is_active;
    if (b.events !== undefined) data.events = b.events;
    return prisma.webhook.update({ where: { id: webhook_id }, data });
  })

  .delete("/:webhook_id/", async ({ params: { slug, webhook_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    await prisma.webhook.update({ where: { id: webhook_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  .post("/:webhook_id/regenerate/", async ({ params: { slug, webhook_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    return prisma.webhook.update({ where: { id: webhook_id }, data: { secret: randomBytes(32).toString("hex") } });
  })

  .get("/:webhook_id/logs/", async ({ params: { slug, webhook_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const where = { webhookId: webhook_id, workspaceId: ws.id };
    return paginate({
      query: (skip, take) => prisma.webhookLog.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      count: () => prisma.webhookLog.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  });
