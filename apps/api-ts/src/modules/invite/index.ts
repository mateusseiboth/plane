import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";
import { getWorkspaceOrFail, requireWorkspaceWriter, getProjectOrFail } from "@utils/workspace";
import { randomUUID } from "crypto";

export const inviteModule = new Elysia({ prefix: "/workspaces/:slug" })
  .use(authPlugin)

  // ── Workspace member invites ───────────────────────────────────────────────

  .get("/invitations/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const where: any = { workspaceId: ws.id };
    if (query.accepted !== undefined) where.accepted = query.accepted === "true";
    return paginate({
      query: (skip, take) => prisma.workspaceMemberInvite.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      count: () => prisma.workspaceMemberInvite.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/invitations/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const b = body as any;
    if (!b.emails?.length) { set.status = 400; return { detail: "emails array is required." }; }

    const created = [];
    for (const item of b.emails) {
      const email = typeof item === "string" ? item : item.email;
      const role = typeof item === "object" ? (item.role ?? 5) : (b.role ?? 5);

      const invite = await prisma.workspaceMemberInvite.create({
        data: {
          workspaceId: ws.id,
          email: email.toLowerCase().trim(),
          role,
          token: randomUUID(),
          message: b.message ?? null,
        },
      });
      created.push(invite);
    }

    set.status = 201;
    return { count: created.length, invitations: created };
  })

  .get("/invitations/:invite_id/", async ({ params: { slug, invite_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    return prisma.workspaceMemberInvite.findFirstOrThrow({ where: { id: invite_id, workspaceId: ws.id } });
  })

  .patch("/invitations/:invite_id/", async ({ params: { slug, invite_id }, body, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const b = body as any;
    const data: any = {};
    if (b.role !== undefined) data.role = b.role;
    if (b.accepted !== undefined) { data.accepted = b.accepted; data.respondedAt = new Date(); }
    return prisma.workspaceMemberInvite.update({ where: { id: invite_id }, data });
  })

  .delete("/invitations/:invite_id/", async ({ params: { slug, invite_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    await prisma.workspaceMemberInvite.delete({ where: { id: invite_id } });
    set.status = 204;
    return null;
  })

  // Accept via token (public — no auth header required)
  .post("/invitations/accept/", async ({ params: { slug }, body, set }) => {
    const b = body as any;
    if (!b.token) { set.status = 400; return { detail: "token is required." }; }

    const ws = await getWorkspaceOrFail(slug);
    const invite = await prisma.workspaceMemberInvite.findFirst({
      where: { workspaceId: ws.id, token: b.token, accepted: false },
    });
    if (!invite) { set.status = 404; return { detail: "Invite not found or already accepted." }; }

    // If user exists, add them as member
    const user = await prisma.user.findFirst({ where: { email: invite.email } });
    await prisma.workspaceMemberInvite.update({
      where: { id: invite.id },
      data: { accepted: true, respondedAt: new Date() },
    });

    if (user) {
      const existing = await prisma.workspaceMember.findFirst({
        where: { workspaceId: ws.id, memberId: user.id, deletedAt: null },
      });
      if (!existing) {
        await prisma.workspaceMember.create({
          data: { workspaceId: ws.id, memberId: user.id, role: invite.role, isActive: true },
        });
      }
    }

    return { accepted: true, email: invite.email };
  })

  // ── Project member invites ─────────────────────────────────────────────────

  .get("/projects/:project_id/invitations/", async ({ params: { slug, project_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { return { results: [], total_count: 0, next_cursor: "100:0:0", prev_cursor: "100:0:1", next_page_results: false, prev_page_results: false }; }

    const where: any = { projectId: project_id, workspaceId: ws.id };
    if (query.accepted !== undefined) where.accepted = query.accepted === "true";
    return paginate({
      query: (skip, take) => prisma.projectMemberInvite.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      count: () => prisma.projectMemberInvite.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/projects/:project_id/invitations/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }

    const b = body as any;
    if (!b.emails?.length) { set.status = 400; return { detail: "emails array is required." }; }

    const created = [];
    for (const item of b.emails) {
      const email = typeof item === "string" ? item : item.email;
      const role = typeof item === "object" ? (item.role ?? 5) : (b.role ?? 5);

      const invite = await prisma.projectMemberInvite.create({
        data: {
          projectId: project_id,
          workspaceId: ws.id,
          invitedById: user.id,
          email: email.toLowerCase().trim(),
          role,
          token: randomUUID(),
        },
      });
      created.push(invite);
    }

    set.status = 201;
    return { count: created.length, invitations: created };
  })

  .delete("/projects/:project_id/invitations/:invite_id/", async ({ params: { slug, project_id, invite_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }
    await prisma.projectMemberInvite.delete({ where: { id: invite_id } });
    set.status = 204;
    return null;
  });
