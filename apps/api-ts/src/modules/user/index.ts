import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";

export const userModule = new Elysia({ prefix: "/users" })
  .use(authPlugin)

  // ── Current user ─────────────────────────────────────────────────────────────

  .get("/me/", async ({ user }) => {
    return prisma.user.findFirstOrThrow({
      where: { id: user.id },
      select: {
        id: true, email: true, firstName: true, lastName: true, displayName: true,
        avatar: true, avatarUrl: true, userTimezone: true, isActive: true,
        isSuperuser: true, isInstanceAdmin: true, dateJoined: true,
        isPasswordAutoset: true, isEmailVerified: true, lastLoginMedium: true,
      },
    });
  })

  .patch("/me/", async ({ user, body }) => {
    const b = body as any;
    const data: any = {};
    if (b.first_name !== undefined) data.firstName = b.first_name;
    if (b.last_name !== undefined) data.lastName = b.last_name;
    if (b.display_name !== undefined) data.displayName = b.display_name;
    if (b.user_timezone !== undefined) data.userTimezone = b.user_timezone;
    if (b.avatar !== undefined) data.avatar = b.avatar;
    return prisma.user.update({ where: { id: user.id }, data });
  })

  .delete("/me/", async ({ user, set }) => {
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false, deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // ── Session ───────────────────────────────────────────────────────────────────

  .get("/session/", async ({ user }) => {
    return {
      id: user.id, email: user.email, display_name: user.displayName,
      first_name: user.firstName, last_name: user.lastName,
      is_active: user.isActive, is_superuser: user.isSuperuser,
      is_instance_admin: user.isInstanceAdmin,
    };
  })

  // ── Settings ──────────────────────────────────────────────────────────────────

  .get("/me/settings/", async ({ user }) => {
    return {
      id: user.id, email: user.email, display_name: user.displayName,
      user_timezone: user.userTimezone, is_instance_admin: user.isInstanceAdmin,
      is_superuser: user.isSuperuser,
    };
  })

  // ── Email operations (stubs - SMTP not configured) ───────────────────────────

  .post("/me/email/generate-code/", async ({ set }) => {
    set.status = 400;
    return { error: "Email is not configured." };
  })

  .patch("/me/email/", async ({ set }) => {
    set.status = 400;
    return { error: "Email update via code is not configured." };
  })

  // ── Profile ───────────────────────────────────────────────────────────────────

  .get("/me/profile/", async ({ user }) => {
    return {
      id: user.id, email: user.email, first_name: user.firstName,
      last_name: user.lastName, display_name: user.displayName,
      avatar: user.avatar, user_timezone: user.userTimezone,
    };
  })

  .patch("/me/profile/", async ({ user, body }) => {
    const b = body as any;
    const data: any = {};
    if (b.first_name !== undefined) data.firstName = b.first_name;
    if (b.last_name !== undefined) data.lastName = b.last_name;
    if (b.display_name !== undefined) data.displayName = b.display_name;
    if (b.user_timezone !== undefined) data.userTimezone = b.user_timezone;
    return prisma.user.update({ where: { id: user.id }, data });
  })

  // ── Accounts (OAuth — not configured) ────────────────────────────────────────

  .get("/me/accounts/", async () => {
    return [];
  })

  .get("/me/accounts/:pk/", async ({ set }) => {
    set.status = 404;
    return { detail: "Not found." };
  })

  .delete("/me/accounts/:pk/", async ({ set }) => {
    set.status = 404;
    return { detail: "Not found." };
  })

  // ── Instance admin check ──────────────────────────────────────────────────────

  .get("/me/instance-admin/", async ({ user }) => {
    return { is_instance_admin: user.isInstanceAdmin, is_superuser: user.isSuperuser };
  })

  // ── Onboarding / Tour ─────────────────────────────────────────────────────────

  .post("/me/onboard/", async ({ user, body }) => {
    const b = body as any;
    const data: any = {};
    if (b.display_name !== undefined) data.displayName = b.display_name;
    if (b.first_name !== undefined) data.firstName = b.first_name;
    if (b.last_name !== undefined) data.lastName = b.last_name;
    if (b.role !== undefined) data.role = b.role;
    return prisma.user.update({ where: { id: user.id }, data });
  })

  .post("/me/tour-completed/", async ({ user }) => {
    return { detail: "Tour marked as completed." };
  })

  // ── Activities ────────────────────────────────────────────────────────────────

  .get("/me/activities/", async ({ user, query }) => {
    const where = { actorId: user.id };
    return paginate({
      query: (skip, take) =>
        prisma.issueActivity.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      count: () => prisma.issueActivity.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  // ── User workspaces ───────────────────────────────────────────────────────────

  .get("/me/workspaces/", async ({ user }) => {
    const memberships = await prisma.workspaceMember.findMany({
      where: { memberId: user.id, isActive: true, deletedAt: null },
      include: { workspace: true },
      orderBy: { createdAt: "desc" },
    });
    return memberships.map(m => ({
      ...m.workspace,
      role: m.role,
    }));
  })

  // ── Workspace invitations ─────────────────────────────────────────────────────

  .get("/me/workspaces/invitations/", async ({ user }) => {
    return prisma.workspaceMemberInvite.findMany({
      where: { email: user.email, accepted: false },
      include: { workspace: { select: { id: true, name: true, slug: true, logo: true } } },
      orderBy: { createdAt: "desc" },
    });
  })

  .post("/me/workspaces/invitations/", async ({ user, body, set }) => {
    const b = body as any;
    const invite = await prisma.workspaceMemberInvite.findFirst({
      where: { token: b.token },
      include: { workspace: true },
    });
    if (!invite) { set.status = 400; return { detail: "Invalid invitation token." }; }
    if (invite.email !== user.email) { set.status = 400; return { detail: "Invitation is not for this email." }; }

    await prisma.$transaction(async tx => {
      await tx.workspaceMemberInvite.update({ where: { id: invite.id }, data: { accepted: true } });
      const existing = await tx.workspaceMember.findFirst({
        where: { workspaceId: invite.workspaceId, memberId: user.id, deletedAt: null },
      });
      if (!existing) {
        await tx.workspaceMember.create({
          data: { workspaceId: invite.workspaceId, memberId: user.id, role: invite.role, isActive: true },
        });
      }
    });
    set.status = 200;
    return { detail: "Invitation accepted." };
  })

  // ── Dashboard ─────────────────────────────────────────────────────────────────

  .get("/me/workspaces/:slug/dashboard/", async ({ user, params: { slug } }) => {
    const ws = await prisma.workspace.findFirst({ where: { slug, deletedAt: null } });
    if (!ws) return { issues: [], recent: [] };
    const recentIssues = await prisma.issue.findMany({
      where: {
        workspaceId: ws.id, deletedAt: null,
        assignees: { some: { assigneeId: user.id, deletedAt: null } },
      },
      include: { state: { select: { name: true, group: true, color: true } } },
      orderBy: { updatedAt: "desc" },
      take: 10,
    });
    return { issues: recentIssues, workspace_id: ws.id };
  })

  // ── Last visited workspace ────────────────────────────────────────────────────

  .get("/last-visited-workspace/", async ({ user }) => {
    const recent = await prisma.userRecentVisit.findFirst({
      where: { userId: user.id },
      orderBy: { visitedAt: "desc" },
      include: { workspace: { select: { slug: true, name: true } } },
    });
    if (!recent) return null;
    return { workspace_slug: recent.workspace?.slug, project_id: null };
  });
