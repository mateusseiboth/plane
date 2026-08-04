import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { getWorkspaceOrFail, requireWorkspaceWriter } from "@utils/workspace";

export const slackIntegrationModule = new Elysia({ prefix: "/workspaces/:slug/slack" })
  .use(authPlugin)

  .get("/config/", async ({ params: { slug }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const config = await prisma.slackIntegrationConfig.findFirst({
      where: { workspaceId: ws.id, deletedAt: null },
      include: { channels: { where: { deletedAt: null } } },
    });
    return config ?? { detail: "Nenhuma integração com o Slack configurada." };
  })

  .post("/config/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const b = body as any;
    try {
      const config = await prisma.slackIntegrationConfig.create({
        data: {
          workspaceId: ws.id, botToken: b.bot_token ?? null,
          teamId: b.team_id ?? null, teamName: b.team_name ?? null,
          isActive: b.is_active ?? true, metadata: b.metadata ?? {},
          createdById: user.id,
        },
      });
      set.status = 201;
      return config;
    } catch (e: any) {
      if (e?.code === "P2002") { set.status = 409; return { detail: "A integração com o Slack já está configurada para este workspace." }; }
      throw e;
    }
  })

  .patch("/config/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const config = await prisma.slackIntegrationConfig.findFirst({ where: { workspaceId: ws.id } });
    if (!config) { set.status = 404; return { detail: "Nenhuma integração com o Slack encontrada." }; }
    const b = body as any;
    const data: any = {};
    if (b.bot_token !== undefined) data.botToken = b.bot_token;
    if (b.team_id !== undefined) data.teamId = b.team_id;
    if (b.team_name !== undefined) data.teamName = b.team_name;
    if (b.is_active !== undefined) data.isActive = b.is_active;
    return prisma.slackIntegrationConfig.update({ where: { id: config.id }, data });
  })

  .delete("/config/", async ({ params: { slug }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    await prisma.slackIntegrationConfig.updateMany({ where: { workspaceId: ws.id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // ── Project channels ───────────────────────────────────────────────────────

  .get("/channels/", async ({ params: { slug }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const config = await prisma.slackIntegrationConfig.findFirst({ where: { workspaceId: ws.id } });
    if (!config) return { results: [] };
    return prisma.slackProjectChannel.findMany({ where: { configId: config.id, deletedAt: null } });
  })

  .post("/channels/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const config = await prisma.slackIntegrationConfig.findFirst({ where: { workspaceId: ws.id } });
    if (!config) { set.status = 400; return { detail: "Configure a integração com o Slack primeiro." }; }
    const b = body as any;
    const ch = await prisma.slackProjectChannel.create({
      data: {
        configId: config.id, projectId: b.project_id, workspaceId: ws.id,
        channelId: b.channel_id, channelName: b.channel_name,
        events: b.events ?? [], isActive: b.is_active ?? true,
      },
    });
    set.status = 201;
    return ch;
  })

  .patch("/channels/:channel_id/", async ({ params: { slug, channel_id }, body, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const b = body as any;
    const data: any = {};
    if (b.events !== undefined) data.events = b.events;
    if (b.is_active !== undefined) data.isActive = b.is_active;
    return prisma.slackProjectChannel.update({ where: { id: channel_id }, data });
  })

  .delete("/channels/:channel_id/", async ({ params: { slug, channel_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    await prisma.slackProjectChannel.update({ where: { id: channel_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  });
