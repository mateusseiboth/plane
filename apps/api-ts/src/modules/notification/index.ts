import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";
import { getWorkspaceOrFail, requireWorkspaceMember } from "@utils/workspace";


/**
 * Serializa a notificação no contrato que o frontend consome.
 *
 * A listagem devolvia o objeto CRU do Prisma, em camelCase. A tela lê
 * `created_at`, `triggered_by_details`, `entity_identifier`… — nenhum campo
 * batia, então a caixa de entrada aparecia vazia mesmo com o contador
 * marcando 8 não lidas.
 */
function serializeNotification(n: any, chamado?: any) {
  const autor = n.actor;
  const conteudo = (n.data ?? {}) as {type?: string; from?: string; to?: string};
  return {
    id: n.id,
    title: n.title,
    /**
     * O card lê `data.issue_activity.field` SEM optional chaining depois de
     * `data?`. Se `data` existe mas `issue_activity` não, a tela inteira quebra
     * com TypeError — foi o que aconteceu ao servir o formato próprio
     * `{type, from, to}`. Aqui ele é traduzido para a forma que a tela espera.
     */
    data: {
      issue: chamado
        ? {
            id: chamado.id,
            name: chamado.name,
            identifier: chamado.project?.identifier ?? "",
            sequence_id: chamado.sequenceId,
            state_name: chamado.state?.name ?? "",
            state_group: chamado.state?.group ?? "",
          }
        : undefined,
      issue_activity: {
        id: n.id,
        actor: n.actorId ?? undefined,
        field: conteudo.type === "state_changed" ? "state" : (n.entity ?? undefined),
        issue_comment: undefined,
        verb: "updated" as const,
        old_value: conteudo.from ?? undefined,
        new_value: conteudo.to ?? undefined,
      },
    },
    entity_identifier: n.entityId ?? undefined,
    entity_name: n.entity ?? undefined,
    message_html: n.message ?? undefined,
    message: undefined,
    message_stripped: undefined,
    sender: n.triggered ?? undefined,
    receiver: n.receiverId ?? undefined,
    triggered_by: n.actorId ?? undefined,
    triggered_by_details: autor
      ? {
          id: autor.id,
          first_name: autor.firstName ?? "",
          last_name: autor.lastName ?? "",
          display_name: autor.displayName ?? "",
          avatar: autor.avatar ?? "",
          avatar_url: autor.avatarUrl ?? "",
          email: autor.email ?? "",
          is_bot: false,
        }
      : undefined,
    read_at: n.readAt ?? undefined,
    archived_at: n.archivedAt ?? undefined,
    snoozed_till: n.snoozedTill ?? undefined,
    is_inbox_issue: n.entity === "intake",
    is_mentioned_notification: n.triggered === "mention",
    workspace: n.workspaceId ?? undefined,
    project: n.projectId ?? undefined,
    created_at: n.createdAt,
    updated_at: n.updatedAt,
    created_by: n.actorId ?? undefined,
    updated_by: n.actorId ?? undefined,
  };
}

export const notificationModule = new Elysia({ prefix: "/workspaces/:slug/users/notifications" })
  .use(authPlugin)

  .get("/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);

    const where: any = { workspaceId: ws.id, receiverId: user.id, isArchived: false };
    if (query.read === "true") where.isRead = true;
    if (query.read === "false") where.isRead = false;

    return paginate({
      query: (skip, take) =>
        prisma.notification.findMany({
          where,
          skip,
          take,
          orderBy: { createdAt: "desc" },
          include: {
            actor: { select: { id: true, firstName: true, lastName: true, displayName: true, avatar: true, avatarUrl: true, email: true } },
          },
        }),
      count: () => prisma.notification.count({ where }),
      cursor: query.cursor as string | undefined,
      // O chamado vem numa consulta só, fora do include: Notification não tem
      // relação declarada com Issue no schema.
      transform: async (items) => {
        const ids = [...new Set(items.map((n: any) => n.issueId).filter(Boolean))] as string[];
        const chamados = ids.length
          ? await prisma.issue.findMany({
              where: {id: {in: ids}},
              select: {id: true, name: true, sequenceId: true, project: {select: {identifier: true}}, state: {select: {name: true, group: true}}},
            })
          : [];
        const porId = new Map(chamados.map((c) => [c.id, c]));
        return items.map((n: any) => serializeNotification(n, n.issueId ? porId.get(n.issueId) : undefined));
      },
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
