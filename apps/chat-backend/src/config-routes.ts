// Configuration & registry CRUD: bot messages, menu options, flows, queues,
// queue members, attendant schedules/breaks, contacts, and the WhatsApp provider.
// All require an authenticated Plane user (the plugin UI further restricts to
// admin/gestor). "TUDO configurável" lives here.
//
// NOTE: Routes use explicit full paths (not a prefix with :slug param) to avoid
// an Elysia 1.4.x routing bug where path parameters in plugin prefixes fail to
// match requests.

import { Elysia } from "elysia";
import prisma from "@db";
import { resolveAttendant } from "@/auth";

async function requireUser(headers: any, set: any) {
  const user = await resolveAttendant(headers);
  if (!user) {
    set.status = 401;
    throw Object.assign(new Error("Não autenticado."), { status: 401 });
  }
  return user;
}

// Admin check against the shared Plane DB (workspace role >= 20). workspaceId here
// is the Plane workspace SLUG (what the chat uses everywhere).
async function isWorkspaceAdmin(slug: string, userId: string): Promise<boolean> {
  try {
    const rows = (await prisma.$queryRaw`
      SELECT wm.role AS role
      FROM workspace_members wm
      JOIN workspaces w ON w.id = wm.workspace_id
      WHERE w.slug = ${slug} AND wm.member_id::text = ${userId}
        AND wm.deleted_at IS NULL AND wm.is_active = true
      LIMIT 1`) as Array<{ role: number }>;
    return Number(rows[0]?.role ?? 0) >= 20;
  } catch {
    return false;
  }
}

async function requireAdmin(slug: string, headers: any, set: any) {
  const user = await requireUser(headers, set);
  if (!(await isWorkspaceAdmin(slug, user.id))) {
    set.status = 403;
    throw Object.assign(new Error("Apenas administradores."), { status: 403 });
  }
  return user;
}

export const configModule = new Elysia()
  // ── Bot config (singleton per workspace) ──
  .get("/workspaces/:slug/config/bot/", async ({ params: { slug }, headers, set }: any) => {
    await requireUser(headers, set);
    return (
      (await prisma.botConfig.findUnique({ where: { workspaceId: slug } })) ??
      (await prisma.botConfig.create({ data: { workspaceId: slug } }))
    );
  })
  .patch("/workspaces/:slug/config/bot/", async ({ params: { slug }, body, headers, set }: any) => {
    await requireUser(headers, set);
    const b = body ?? {};
    const data: any = {};
    for (const k of [
      "welcomeMessage",
      "menuHeader",
      "noAttendantsMessage",
      "askNameMessage",
      "confirmContactMessage",
      "idlePromptMessage",
      "idleCloseMessage",
      "closedMessage",
      "outsideHoursMessage",
      "businessHours",
      "businessBreaks",
      "routingAlpha",
      "routingBeta",
    ])
      if (b[k] !== undefined) data[k] = b[k];
    return prisma.botConfig.upsert({ where: { workspaceId: slug }, create: { workspaceId: slug, ...data }, update: data });
  })

  // ── Menu options ──
  .get("/workspaces/:slug/config/menu/", async ({ params: { slug }, headers, set }: any) => {
    await requireUser(headers, set);
    return prisma.botMenuOption.findMany({ where: { workspaceId: slug }, orderBy: { order: "asc" } });
  })
  .post("/workspaces/:slug/config/menu/", async ({ params: { slug }, body, headers, set }: any) => {
    await requireUser(headers, set);
    const b = body ?? {};
    return prisma.botMenuOption.create({
      data: {
        workspaceId: slug,
        order: b.order ?? 0,
        key: String(b.key ?? ""),
        label: String(b.label ?? ""),
        action: b.action ?? "message",
        queueId: b.queue_id ?? null,
        flowId: b.flow_id ?? null,
        message: b.message ?? null,
      },
    });
  })
  .patch("/workspaces/:slug/config/menu/:id/", async ({ params: { slug: _slug, id }, body, headers, set }: any) => {
    await requireUser(headers, set);
    const b = body ?? {};
    const data: any = {};
    if (b.order !== undefined) data.order = b.order;
    if (b.key !== undefined) data.key = String(b.key);
    if (b.label !== undefined) data.label = String(b.label);
    if (b.action !== undefined) data.action = b.action;
    if (b.queue_id !== undefined) data.queueId = b.queue_id;
    if (b.flow_id !== undefined) data.flowId = b.flow_id;
    if (b.message !== undefined) data.message = b.message;
    if (b.is_active !== undefined) data.isActive = b.is_active;
    return prisma.botMenuOption.update({ where: { id }, data });
  })
  .delete("/workspaces/:slug/config/menu/:id/", async ({ params: { id }, headers, set }: any) => {
    await requireUser(headers, set);
    await prisma.botMenuOption.delete({ where: { id } });
    return { ok: true };
  })

  // ── Flows ──
  .get("/workspaces/:slug/config/flows/", async ({ params: { slug }, headers, set }: any) => {
    await requireUser(headers, set);
    return prisma.botFlow.findMany({ where: { workspaceId: slug }, orderBy: { createdAt: "asc" } });
  })
  .post("/workspaces/:slug/config/flows/", async ({ params: { slug }, body, headers, set }: any) => {
    await requireUser(headers, set);
    const b = body ?? {};
    return prisma.botFlow.create({ data: { workspaceId: slug, name: b.name ?? "Fluxo", steps: b.steps ?? [] } });
  })
  .patch("/workspaces/:slug/config/flows/:id/", async ({ params: { id }, body, headers, set }: any) => {
    await requireUser(headers, set);
    const b = body ?? {};
    const data: any = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.steps !== undefined) data.steps = b.steps;
    if (b.is_active !== undefined) data.isActive = b.is_active;
    return prisma.botFlow.update({ where: { id }, data });
  })
  .delete("/workspaces/:slug/config/flows/:id/", async ({ params: { id }, headers, set }: any) => {
    await requireUser(headers, set);
    await prisma.botFlow.delete({ where: { id } });
    return { ok: true };
  })

  // ── Queues + members ──
  .get("/workspaces/:slug/config/queues/", async ({ params: { slug }, headers, set }: any) => {
    await requireUser(headers, set);
    return prisma.queue.findMany({ where: { workspaceId: slug }, include: { members: true } });
  })
  .post("/workspaces/:slug/config/queues/", async ({ params: { slug }, body, headers, set }: any) => {
    await requireUser(headers, set);
    return prisma.queue.create({ data: { workspaceId: slug, name: (body as any)?.name ?? "Fila" } });
  })
  .patch("/workspaces/:slug/config/queues/:id/", async ({ params: { id }, body, headers, set }: any) => {
    await requireUser(headers, set);
    const b = body ?? {};
    const data: any = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.is_active !== undefined) data.isActive = b.is_active;
    return prisma.queue.update({ where: { id }, data });
  })
  .delete("/workspaces/:slug/config/queues/:id/", async ({ params: { id }, headers, set }: any) => {
    await requireUser(headers, set);
    await prisma.queue.delete({ where: { id } });
    return { ok: true };
  })
  .put("/workspaces/:slug/config/queues/:id/members/", async ({ params: { id }, body, headers, set }: any) => {
    await requireUser(headers, set);
    const userIds: string[] = (body as any)?.user_ids ?? [];
    await prisma.queueMember.deleteMany({ where: { queueId: id } });
    if (userIds.length)
      await prisma.queueMember.createMany({ data: userIds.map((userId) => ({ queueId: id, userId })), skipDuplicates: true });
    return prisma.queueMember.findMany({ where: { queueId: id } });
  })

  // ── Attendant schedules / breaks ──
  .get("/workspaces/:slug/config/schedules/:userId/", async ({ params: { slug, userId }, headers, set }: any) => {
    await requireUser(headers, set);
    const [schedules, breaks] = await Promise.all([
      prisma.attendantSchedule.findMany({ where: { workspaceId: slug, userId } }),
      prisma.attendantBreak.findMany({ where: { workspaceId: slug, userId } }),
    ]);
    return { schedules, breaks };
  })
  .put("/workspaces/:slug/config/schedules/:userId/", async ({ params: { slug, userId }, body, headers, set }: any) => {
    await requireUser(headers, set);
    const b = body ?? {};
    await prisma.attendantSchedule.deleteMany({ where: { workspaceId: slug, userId } });
    await prisma.attendantBreak.deleteMany({ where: { workspaceId: slug, userId } });
    if (Array.isArray(b.schedules) && b.schedules.length)
      await prisma.attendantSchedule.createMany({
        data: b.schedules.map((s: any) => ({ workspaceId: slug, userId, weekday: s.weekday, startTime: s.start_time, endTime: s.end_time })),
      });
    if (Array.isArray(b.breaks) && b.breaks.length)
      await prisma.attendantBreak.createMany({
        data: b.breaks.map((s: any) => ({ workspaceId: slug, userId, weekday: s.weekday, startTime: s.start_time, endTime: s.end_time })),
      });
    return { ok: true };
  })

  // ── Attendant visibility ──
  .get("/workspaces/:slug/config/attendants/status/", async ({ params: { slug }, headers, set }: any) => {
    await requireUser(headers, set);
    try {
      const statuses = await (prisma as any).attendantStatus.findMany({ where: { workspaceId: slug } });
      return statuses.map((s: any) => ({ user_id: s.userId, is_invisible: s.isInvisible }));
    } catch {
      return []; // table not migrated yet
    }
  })
  .patch("/workspaces/:slug/config/attendants/:userId/visibility/", async ({ params: { slug, userId }, body, headers, set }: any) => {
    await requireAdmin(slug, headers, set);
    const isInvisible = Boolean((body as any)?.is_invisible);
    try {
      const saved = await (prisma as any).attendantStatus.upsert({
        where: { workspaceId_userId: { workspaceId: slug, userId } },
        create: { workspaceId: slug, userId, isInvisible },
        update: { isInvisible },
      });
      return { user_id: saved.userId, is_invisible: saved.isInvisible };
    } catch {
      return { user_id: userId, is_invisible: isInvisible };
    }
  })

  // ── Contacts ──
  .get("/workspaces/:slug/config/contacts/", async ({ params: { slug }, query, headers, set }: any) => {
    await requireUser(headers, set);
    const search = (query?.search ?? "").trim();
    return prisma.contact.findMany({
      where: {
        workspaceId: slug,
        ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { phone: { contains: search } }] } : {}),
      },
      orderBy: { name: "asc" },
      take: 100,
    });
  })
  .post("/workspaces/:slug/config/contacts/", async ({ params: { slug }, body, headers, set }: any) => {
    await requireUser(headers, set);
    const b = body ?? {};
    return prisma.contact.create({ data: { workspaceId: slug, name: b.name ?? null, phone: b.phone ?? null, email: b.email ?? null } });
  })
  .patch("/workspaces/:slug/config/contacts/:id/", async ({ params: { id }, body, headers, set }: any) => {
    await requireUser(headers, set);
    const b = body ?? {};
    const data: any = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.phone !== undefined) data.phone = b.phone;
    if (b.email !== undefined) data.email = b.email;
    return prisma.contact.update({ where: { id }, data });
  })

  // ── WhatsApp provider config ──
  .get("/workspaces/:slug/config/provider/", async ({ params: { slug }, headers, set }: any) => {
    await requireUser(headers, set);
    const cfg = await prisma.providerConfig.findUnique({ where: { workspaceId: slug } });
    if (!cfg) return { provider: "zapi", is_active: false };
    return { provider: cfg.provider, instance_id: cfg.instanceId, base_url: cfg.baseUrl, client_token: Boolean(cfg.clientToken), has_token: Boolean(cfg.token), is_active: cfg.isActive };
  })
  .patch("/workspaces/:slug/config/provider/", async ({ params: { slug }, body, headers, set }: any) => {
    await requireUser(headers, set);
    const b = body ?? {};
    const data: any = { provider: b.provider ?? "zapi" };
    if (b.instance_id !== undefined) data.instanceId = b.instance_id;
    if (b.base_url !== undefined) data.baseUrl = b.base_url;
    if (b.is_active !== undefined) data.isActive = b.is_active;
    if (b.token) data.token = b.token;
    if (b.client_token) data.clientToken = b.client_token;
    const saved = await prisma.providerConfig.upsert({ where: { workspaceId: slug }, create: { workspaceId: slug, ...data }, update: data });
    return { ok: true, is_active: saved.isActive };
  });
