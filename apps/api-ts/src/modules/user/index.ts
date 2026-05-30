import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";

function userDto(u: any, lastWorkspaceId?: string | null) {
  return {
    id: u.id,
    email: u.email,
    username: u.username ?? "",
    first_name: u.firstName,
    last_name: u.lastName,
    display_name: u.displayName,
    avatar: u.avatar ?? "",
    avatar_url: u.avatarUrl ?? u.avatar ?? null,
    cover_image_url: null,
    cover_image: null,
    date_joined: u.dateJoined instanceof Date ? u.dateJoined.toISOString() : (u.dateJoined ?? new Date().toISOString()),
    is_active: u.isActive,
    is_email_verified: u.isEmailVerified ?? true,
    is_password_autoset: u.isPasswordAutoset ?? false,
    is_tour_completed: true,
    mobile_number: null,
    last_workspace_id: lastWorkspaceId ?? null,
    user_timezone: u.userTimezone ?? "UTC",
    last_login_medium: u.lastLoginMedium ?? "email",
    is_bot: false,
    is_superuser: u.isSuperuser ?? false,
    is_instance_admin: u.isInstanceAdmin ?? false,
    theme: {
      theme: "system",
      primary: "#3F76FF",
      background: "#FAFAFA",
      darkPalette: false,
      pallette: "",
      fontStyle: "sans-serif",
    },
  };
}

async function getUserWithLastWorkspace(userId: string) {
  const u = await prisma.user.findFirstOrThrow({ where: { id: userId } });
  const lastMembership = await prisma.workspaceMember.findFirst({
    where: { memberId: userId, isActive: true, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { workspaceId: true },
  });
  return userDto(u, lastMembership?.workspaceId ?? null);
}

async function formatWorkspace(ws: any, memberRole: number) {
  const adminMember = await prisma.workspaceMember.findFirst({
    where: { workspaceId: ws.id, role: { gte: 20 }, deletedAt: null },
    include: { member: { select: { id: true, email: true, firstName: true, lastName: true, displayName: true, avatar: true, avatarUrl: true } } },
  });
  const [totalMembers, totalProjects] = await Promise.all([
    prisma.workspaceMember.count({ where: { workspaceId: ws.id, isActive: true, deletedAt: null } }),
    prisma.project.count({ where: { workspaceId: ws.id, deletedAt: null } }),
  ]);
  const owner = adminMember?.member;
  return {
    id: ws.id,
    name: ws.name,
    slug: ws.slug,
    url: `/${ws.slug}`,
    logo: ws.logo ?? null,
    logo_url: ws.logoUrl ?? null,
    organization_size: ws.orgSize ?? "",
    timezone: ws.timezone ?? "UTC",
    created_at: ws.createdAt instanceof Date ? ws.createdAt.toISOString() : ws.createdAt,
    updated_at: ws.updatedAt instanceof Date ? ws.updatedAt.toISOString() : ws.updatedAt,
    created_by: owner?.id ?? "",
    updated_by: owner?.id ?? "",
    owner: owner
      ? {
          id: owner.id,
          email: owner.email,
          first_name: owner.firstName,
          last_name: owner.lastName,
          display_name: owner.displayName,
          avatar: owner.avatar ?? "",
          avatar_url: owner.avatarUrl ?? owner.avatar ?? null,
          is_bot: false,
        }
      : null,
    total_members: totalMembers,
    total_projects: totalProjects,
    role: memberRole,
  };
}

export const userModule = new Elysia({ prefix: "/users" })
  .use(authPlugin)

  // ── Current user ─────────────────────────────────────────────────────────────

  .get("/me/", async ({ user }) => getUserWithLastWorkspace(user.id))

  .patch("/me/", async ({ user, body }) => {
    const b = body as any;
    const data: any = {};
    if (b.first_name !== undefined) data.firstName = b.first_name;
    if (b.last_name !== undefined) data.lastName = b.last_name;
    if (b.display_name !== undefined) data.displayName = b.display_name;
    if (b.user_timezone !== undefined) data.userTimezone = b.user_timezone;
    if (b.avatar !== undefined) data.avatar = b.avatar;
    const updated = await prisma.user.update({ where: { id: user.id }, data });
    const lastMembership = await prisma.workspaceMember.findFirst({
      where: { memberId: user.id, isActive: true, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { workspaceId: true },
    });
    return userDto(updated, lastMembership?.workspaceId ?? null);
  })

  .delete("/me/", async ({ user, set }) => {
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false, deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // ── Session ───────────────────────────────────────────────────────────────────

  .get("/session/", async ({ user }) => ({
    id: user.id,
    email: user.email,
    display_name: user.displayName,
    first_name: user.firstName,
    last_name: user.lastName,
    is_active: user.isActive,
    is_superuser: user.isSuperuser,
    is_instance_admin: user.isInstanceAdmin,
  }))

  // ── Settings ──────────────────────────────────────────────────────────────────

  .get("/me/settings/", async ({ user }) => {
    const lastMembership = await prisma.workspaceMember.findFirst({
      where: { memberId: user.id, isActive: true, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { workspaceId: true },
    });
    return {
      id: user.id,
      email: user.email,
      display_name: user.displayName,
      user_timezone: user.userTimezone,
      last_workspace_id: lastMembership?.workspaceId ?? null,
      is_instance_admin: user.isInstanceAdmin,
      is_superuser: user.isSuperuser,
    };
  })

  // ── Email operations ─────────────────────────────────────────────────────────

  .post("/me/email/generate-code/", async ({ set }) => {
    set.status = 400;
    return { error: "Email is not configured." };
  })

  .patch("/me/email/", async ({ set }) => {
    set.status = 400;
    return { error: "Email update via code is not configured." };
  })

  // ── Profile (TUserProfile contract) ──────────────────────────────────────────

  .get("/me/profile/", async ({ user }) => {
    const lastMembership = await prisma.workspaceMember.findFirst({
      where: { memberId: user.id, isActive: true, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { workspaceId: true },
    });
    return {
      id: user.id,
      user: user.id,
      role: null,
      last_workspace_id: lastMembership?.workspaceId ?? null,
      theme: {
        theme: "system",
        primary: "#3F76FF",
        background: "#FAFAFA",
        darkPalette: false,
        pallette: "",
        fontStyle: "sans-serif",
      },
      onboarding_step: {
        profile_complete: true,
        workspace_join: true,
        workspace_create: true,
        workspace_invite: true,
      },
      is_onboarded: true,
      is_tour_completed: true,
      use_case: null,
      billing_address_country: null,
      billing_address: null,
      has_billing_address: false,
      has_marketing_email_consent: false,
    };
  })

  .patch("/me/profile/", async ({ user, body }) => {
    const b = body as any;
    const data: any = {};
    if (b.first_name !== undefined) data.firstName = b.first_name;
    if (b.last_name !== undefined) data.lastName = b.last_name;
    if (b.display_name !== undefined) data.displayName = b.display_name;
    if (b.user_timezone !== undefined) data.userTimezone = b.user_timezone;
    await prisma.user.update({ where: { id: user.id }, data });
    const lastMembership = await prisma.workspaceMember.findFirst({
      where: { memberId: user.id, isActive: true, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { workspaceId: true },
    });
    return {
      id: user.id,
      user: user.id,
      last_workspace_id: lastMembership?.workspaceId ?? null,
      onboarding_step: {
        profile_complete: true,
        workspace_join: true,
        workspace_create: true,
        workspace_invite: true,
      },
      is_onboarded: true,
      is_tour_completed: true,
    };
  })

  // ── Accounts (OAuth stubs) ────────────────────────────────────────────────────

  .get("/me/accounts/", async () => [])

  .get("/me/accounts/:pk/", async ({ set }) => { set.status = 404; return { detail: "Not found." }; })

  .delete("/me/accounts/:pk/", async ({ set }) => { set.status = 404; return { detail: "Not found." }; })

  // ── Instance admin check ──────────────────────────────────────────────────────

  .get("/me/instance-admin/", async ({ user }) => ({
    is_instance_admin: user.isInstanceAdmin,
    is_superuser: user.isSuperuser,
  }))

  // ── Onboarding / Tour ─────────────────────────────────────────────────────────

  .post("/me/onboard/", async ({ user, body }) => {
    const b = body as any;
    const data: any = {};
    if (b.display_name !== undefined) data.displayName = b.display_name;
    if (b.first_name !== undefined) data.firstName = b.first_name;
    if (b.last_name !== undefined) data.lastName = b.last_name;
    await prisma.user.update({ where: { id: user.id }, data });
    return { detail: "Onboarded successfully." };
  })

  .post("/me/tour-completed/", async ({ user }) => ({ detail: "Tour marked as completed." }))

  // ── Update onboarding step ────────────────────────────────────────────────────

  .patch("/me/onboarding/", async ({ user }) => ({
    id: user.id,
    user: user.id,
    is_onboarded: true,
    onboarding_step: {
      profile_complete: true,
      workspace_join: true,
      workspace_create: true,
      workspace_invite: true,
    },
  }))

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

  // ── User workspaces (IWorkspace[] contract) ──────────────────────────────────

  .get("/me/workspaces/", async ({ user }) => {
    const memberships = await prisma.workspaceMember.findMany({
      where: { memberId: user.id, isActive: true, deletedAt: null },
      include: { workspace: true },
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(memberships.map(m => formatWorkspace(m.workspace, m.role)));
  })

  // ── Workspace invitations ─────────────────────────────────────────────────────

  .get("/me/workspaces/invitations/", async ({ user }) => {
    const invites = await prisma.workspaceMemberInvite.findMany({
      where: { email: user.email, accepted: false },
      include: { workspace: { select: { id: true, name: true, slug: true, logo: true } } },
      orderBy: { createdAt: "desc" },
    });
    return invites.map(i => ({
      id: i.id,
      email: i.email,
      token: i.token,
      role: i.role,
      workspace: {
        id: i.workspace.id,
        name: i.workspace.name,
        slug: i.workspace.slug,
        logo: i.workspace.logo,
      },
    }));
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

  // ── Project roles per workspace (IUserProjectsRole: { [projectId]: role }) ────

  .get("/me/workspaces/:slug/project-roles/", async ({ user, params: { slug } }) => {
    const ws = await prisma.workspace.findFirst({ where: { slug, deletedAt: null } });
    if (!ws) return {};
    const memberships = await prisma.projectMember.findMany({
      where: { workspaceId: ws.id, memberId: user.id, isActive: true, deletedAt: null },
      select: { projectId: true, role: true },
    });
    return Object.fromEntries(memberships.map(m => [m.projectId, m.role]));
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
