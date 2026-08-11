import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";
import { getWorkspaceOrFail, requireWorkspaceMember } from "@utils/workspace";

export const notificationModule = new Elysia({ prefix: "/workspaces/:slug/users/notifications" })
  .use(authPlugin)

  .get("/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);

    const where: any = { workspaceId: ws.id, receiverId: user.id, isArchived: false };
    if (query.read === "true") where.isRead = true;
    if (query.read === "false") where.isRead = false;

    return paginate({
      query: (skip, take) => prisma.notification.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      count: () => prisma.notification.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  /**
   * Contadores do sino.
   *
   * Devolvia `{count}`, mas o frontend lê `total_unread_notifications_count` e
   * `mention_unread_notifications_count` (packages/types, TUnreadNotificationsCount):
   * o contador chegava `undefined` e o sino ficava sempre apagado, por mais
   * notificações não lidas que houvesse.
   */
  .get("/unread/", async ({ params: { slug }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const base = { workspaceId: ws.id, receiverId: user.id, isRead: false, isArchived: false };
    const [total, mencoes] = await Promise.all([
      prisma.notification.count({ where: base }),
      prisma.notification.count({ where: { ...base, triggered: "mention" } }),
    ]);
    return {
      count: total, // mantido para quem já consumia a forma antiga
      total_unread_notifications_count: total,
      mention_unread_notifications_count: mencoes,
    };
  })

  /**
   * Ler / marcar como não lida / arquivar / desarquivar.
   *
   * O frontend chama estes quatro caminhos (POST e DELETE em `/read/` e
   * `/archive/`) desde sempre; a migração só trouxe o PATCH consolidado, então
   * marcar uma notificação como lida devolvia 404 e ela nunca saía da lista.
   */
  .post("/:notification_id/read/", async ({ params: { slug, notification_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const {count} = await prisma.notification.updateMany({
      where: { id: notification_id, receiverId: user.id },
      data: { isRead: true, readAt: new Date() },
    });
    if (!count) { set.status = 404; return { detail: "Notificação não encontrada." }; }
    return prisma.notification.findUnique({ where: { id: notification_id } });
  })

  .delete("/:notification_id/read/", async ({ params: { slug, notification_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    await prisma.notification.updateMany({
      where: { id: notification_id, receiverId: user.id },
      data: { isRead: false, readAt: null },
    });
    set.status = 204;
    return null;
  })

  .post("/:notification_id/archive/", async ({ params: { slug, notification_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const {count} = await prisma.notification.updateMany({
      where: { id: notification_id, receiverId: user.id },
      data: { isArchived: true, archivedAt: new Date() },
    });
    if (!count) { set.status = 404; return { detail: "Notificação não encontrada." }; }
    return prisma.notification.findUnique({ where: { id: notification_id } });
  })

  .delete("/:notification_id/archive/", async ({ params: { slug, notification_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    await prisma.notification.updateMany({
      where: { id: notification_id, receiverId: user.id },
      data: { isArchived: false, archivedAt: null },
    });
    set.status = 204;
    return null;
  })

  .get("/:notification_id/", async ({ params: { slug, notification_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const notif = await prisma.notification.findFirst({ where: { id: notification_id, receiverId: user.id, workspaceId: ws.id } });
    if (!notif) { set.status = 404; return { detail: "Notificação não encontrada." }; }
    return notif;
  })

  .post("/mark-all-read/", async ({ params: { slug }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const result = await prisma.notification.updateMany({
      where: { workspaceId: ws.id, receiverId: user.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { marked: result.count };
  })

  .patch("/:notification_id/", async ({ params: { slug, notification_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const notif = await prisma.notification.findFirst({ where: { id: notification_id, receiverId: user.id } });
    if (!notif) { set.status = 404; return { detail: "Notificação não encontrada." }; }

    const b = body as any;
    const data: any = {};
    if (b.is_read !== undefined) { data.isRead = b.is_read; if (b.is_read) data.readAt = new Date(); }
    if (b.is_archived !== undefined) { data.isArchived = b.is_archived; if (b.is_archived) data.archivedAt = new Date(); }

    return prisma.notification.update({ where: { id: notification_id }, data });
  })

  .delete("/:notification_id/", async ({ params: { slug, notification_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    await prisma.notification.updateMany({ where: { id: notification_id, receiverId: user.id }, data: { isArchived: true, archivedAt: new Date() } });
    set.status = 204;
    return null;
  });
