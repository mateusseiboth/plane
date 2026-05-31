import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";
import { getWorkspaceOrFail, requireWorkspaceMember, getProjectOrFail } from "@utils/workspace";

const DEFAULT_STATES = [
  { name: "Backlog",     color: "#94a3b8", group: "backlog",   sequence: 15000, isDefault: true },
  { name: "A Fazer",    color: "#eb5757", group: "unstarted", sequence: 30000 },
  { name: "Em Andamento", color: "#f59e0b", group: "started",   sequence: 45000 },
  { name: "Concluído",  color: "#16a34a", group: "completed", sequence: 60000 },
  { name: "Cancelado",  color: "#dc2626", group: "cancelled", sequence: 75000 },
  { name: "Triagem",    color: "#6366f1", group: "triage",    sequence: 90000, isTriage: true },
];

function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function formatProject(p: any, memberRole?: number) {
  return {
    id: p.id,
    name: p.name,
    identifier: p.identifier,
    description: p.description ?? "",
    network: p.network,
    workspace: p.workspaceId,
    member_role: memberRole ?? null,
    archived_at: p.archivedAt ? p.archivedAt.toISOString() : null,
    sort_order: p.sortOrder ?? null,
    logo_props: p.iconProp ?? {},
    cover_image: p.coverImage ?? null,
    cycle_view: p.cycleView,
    issue_views_view: p.issueViewsView,
    module_view: p.moduleView,
    page_view: p.pageView,
    inbox_view: p.intakeView,
    default_assignee: p.defaultAssigneeId ?? null,
    project_lead: p.projectLeadId ?? null,
    default_state: p.defaultStateId ?? null,
    estimate: p.estimateId ?? null,
    timezone: p.timezone ?? null,
    archive_in: p.archiveIn,
    close_in: p.closeIn,
    created_at: p.createdAt?.toISOString(),
    updated_at: p.updatedAt?.toISOString(),
    created_by: p.createdById ?? null,
    updated_by: p.updatedById ?? null,
  };
}

export const projectModule = new Elysia({ prefix: "/workspaces/:slug/projects" })
  .use(authPlugin)

  // ── List projects (plain array — frontend expects IPartialProject[]) ─────────
  // Workspace admins (role >= 20) see ALL projects.
  // Non-admins see only projects they are active members of.

  .get("/", async ({ params: { slug }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    const wsMember = await requireWorkspaceMember(ws.id, user.id);
    const isAdmin = wsMember.role >= 20;

    const where: any = { workspaceId: ws.id, deletedAt: null, archivedAt: null };
    if (!isAdmin) {
      where.members = { some: { memberId: user.id, isActive: true, deletedAt: null } };
    }

    const [projects, myMemberships] = await Promise.all([
      prisma.project.findMany({ where, orderBy: { createdAt: "desc" } }),
      prisma.projectMember.findMany({
        where: { workspaceId: ws.id, memberId: user.id, deletedAt: null },
        select: { projectId: true, role: true },
      }),
    ]);
    const roleMap = Object.fromEntries(myMemberships.map((m) => [m.projectId, m.role]));
    // Admins get role 20 for all projects they aren't explicitly in
    return projects.map((p) => formatProject(p, roleMap[p.id] ?? (isAdmin ? 20 : undefined)));
  })

  // Alias for /details/ — frontend calls this for full project list
  .get("/details/", async ({ params: { slug }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    const wsMember = await requireWorkspaceMember(ws.id, user.id);
    const isAdmin = wsMember.role >= 20;

    const where: any = { workspaceId: ws.id, deletedAt: null };
    if (!isAdmin) {
      where.members = { some: { memberId: user.id, isActive: true, deletedAt: null } };
    }

    const [projects, myMemberships] = await Promise.all([
      prisma.project.findMany({ where, orderBy: { createdAt: "desc" } }),
      prisma.projectMember.findMany({
        where: { workspaceId: ws.id, memberId: user.id, deletedAt: null },
        select: { projectId: true, role: true },
      }),
    ]);
    const roleMap = Object.fromEntries(myMemberships.map((m) => [m.projectId, m.role]));
    return projects.map((p) => formatProject(p, roleMap[p.id] ?? (isAdmin ? 20 : undefined)));
  })

  .post("/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);

    const b = body as any;
    if (!b.name) { set.status = 400; return { detail: "Name is required." }; }
    if (!b.identifier) { set.status = 400; return { detail: "Identifier is required." }; }

    const exists = await prisma.project.findFirst({
      where: { workspaceId: ws.id, identifier: b.identifier.toUpperCase(), deletedAt: null },
    });
    if (exists) { set.status = 409; return { detail: "Project with this identifier already exists." }; }

    const project = await prisma.$transaction(async (tx) => {
      const p = await tx.project.create({
        data: {
          workspaceId: ws.id,
          name: b.name,
          identifier: b.identifier.toUpperCase(),
          description: b.description ?? "",
          network: b.network ?? 2,
          projectLeadId: b.project_lead ?? null,
          createdById: user.id,
        },
      });

      await tx.projectMember.create({
        data: { projectId: p.id, workspaceId: ws.id, memberId: user.id, role: 20, isActive: true },
      });

      if (b.project_lead && b.project_lead !== user.id) {
        const alreadyMember = await tx.projectMember.findFirst({
          where: { projectId: p.id, memberId: b.project_lead, deletedAt: null },
        });
        if (!alreadyMember) {
          await tx.projectMember.create({
            data: { projectId: p.id, workspaceId: ws.id, memberId: b.project_lead, role: 20, isActive: true },
          });
        }
      }

      await tx.state.createMany({
        data: DEFAULT_STATES.map((s) => ({
          projectId: p.id,
          workspaceId: ws.id,
          name: s.name,
          color: s.color,
          group: s.group,
          sequence: s.sequence,
          default: s.isDefault ?? false,
          isTriage: (s as any).isTriage ?? false,
          slug: slugify(s.name),
        })),
      });

      return p;
    });

    set.status = 201;
    return formatProject(project, 20);
  })

  .get("/:project_id/", async ({ params: { slug, project_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { project, member } = await getProjectOrFail(ws.id, project_id, user.id);
    return formatProject(project, member.role);
  })

  // Trailing-slash-optional alias
  .get("/:project_id", async ({ params: { slug, project_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { project, member } = await getProjectOrFail(ws.id, project_id, user.id);
    return formatProject(project, member.role);
  })

  .patch("/:project_id/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }
    const b = body as any;
    const data: any = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.description !== undefined) data.description = b.description;
    if (b.network !== undefined) data.network = b.network;
    if (b.project_lead !== undefined) data.projectLeadId = b.project_lead;
    if (b.default_assignee !== undefined) data.defaultAssigneeId = b.default_assignee;
    if (b.module_view !== undefined) data.moduleView = b.module_view;
    if (b.cycle_view !== undefined) data.cycleView = b.cycle_view;
    if (b.page_view !== undefined) data.pageView = b.page_view;
    if (b.inbox_view !== undefined) data.intakeView = b.inbox_view;
    if (b.issue_views_view !== undefined) data.issueViewsView = b.issue_views_view;
    if (b.archive_in !== undefined) data.archiveIn = b.archive_in;
    if (b.close_in !== undefined) data.closeIn = b.close_in;
    if (b.timezone !== undefined) data.timezone = b.timezone;
    const updated = await prisma.project.update({ where: { id: project_id }, data });
    return formatProject(updated, member.role);
  })

  // Trailing-slash-optional alias
  .patch("/:project_id", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }
    const b = body as any;
    const data: any = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.description !== undefined) data.description = b.description;
    if (b.network !== undefined) data.network = b.network;
    if (b.project_lead !== undefined) data.projectLeadId = b.project_lead;
    if (b.module_view !== undefined) data.moduleView = b.module_view;
    if (b.cycle_view !== undefined) data.cycleView = b.cycle_view;
    if (b.page_view !== undefined) data.pageView = b.page_view;
    if (b.inbox_view !== undefined) data.intakeView = b.inbox_view;
    const updated = await prisma.project.update({ where: { id: project_id }, data });
    return formatProject(updated, member.role);
  })

  .delete("/:project_id/", async ({ params: { slug, project_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 20) { set.status = 403; return { detail: "Only admins can delete projects." }; }
    await prisma.project.update({ where: { id: project_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  .delete("/:project_id", async ({ params: { slug, project_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 20) { set.status = 403; return { detail: "Only admins can delete projects." }; }
    await prisma.project.update({ where: { id: project_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // ── Project members (plain array — frontend expects TProjectMembership[]) ────

  .get("/:project_id/members/", async ({ params: { slug, project_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { project } = await getProjectOrFail(ws.id, project_id, user.id);
    const members = await prisma.projectMember.findMany({
      where: { projectId: project.id, isActive: true, deletedAt: null },
      include: { member: { select: { id: true, email: true, firstName: true, lastName: true, displayName: true, avatar: true, avatarUrl: true } } },
      orderBy: { createdAt: "asc" },
    });
    return members.map((m) => ({
      id: m.id,
      member: m.member.id,
      member__display_name: m.member.displayName,
      member__avatar_url: m.member.avatarUrl ?? m.member.avatar,
      role: m.role,
      original_role: m.role,
      created_at: m.createdAt.toISOString(),
    }));
  })

  .post("/:project_id/members/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { project, member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }
    const b = body as any;
    const members: Array<{ member_id: string; role: number }> = Array.isArray(b) ? b : b.members ?? [b];
    const results = [];
    for (const m of members) {
      const created = await prisma.projectMember.upsert({
        where: { projectId_memberId: { projectId: project.id, memberId: m.member_id } },
        create: { projectId: project.id, workspaceId: ws.id, memberId: m.member_id, role: m.role ?? 5, isActive: true },
        update: { role: m.role ?? 5, isActive: true, deletedAt: null },
        include: { member: { select: { id: true } } },
      });
      results.push({ id: created.id, member: created.memberId, role: created.role, original_role: created.role });
    }
    set.status = 201;
    return results;
  })

  .get("/:project_id/members/:pk/", async ({ params: { slug, project_id, pk }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { project } = await getProjectOrFail(ws.id, project_id, user.id);
    const m = await prisma.projectMember.findFirst({
      where: { projectId: project.id, memberId: pk, deletedAt: null },
    });
    if (!m) { set.status = 404; return { detail: "Not found." }; }
    return { id: m.id, member: m.memberId, role: m.role, original_role: m.role, created_at: m.createdAt.toISOString() };
  })

  .patch("/:project_id/members/:pk/", async ({ params: { slug, project_id, pk }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { project, member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }
    const b = body as any;
    const data: any = {};
    if (b.role !== undefined) data.role = b.role;
    await prisma.projectMember.updateMany({ where: { projectId: project.id, memberId: pk }, data });
    const updated = await prisma.projectMember.findFirst({ where: { projectId: project.id, memberId: pk, deletedAt: null } });
    return updated
      ? { id: updated.id, member: updated.memberId, role: updated.role, original_role: updated.role }
      : { detail: "Not found." };
  })

  .delete("/:project_id/members/:pk/", async ({ params: { slug, project_id, pk }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { project, member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }
    await prisma.projectMember.updateMany({
      where: { projectId: project.id, memberId: pk },
      data: { isActive: false, deletedAt: new Date() },
    });
    set.status = 204;
    return null;
  })

  .post("/:project_id/members/leave/", async ({ params: { slug, project_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { project } = await getProjectOrFail(ws.id, project_id, user.id);
    await prisma.projectMember.updateMany({
      where: { projectId: project.id, memberId: user.id },
      data: { isActive: false, deletedAt: new Date() },
    });
    set.status = 204;
    return null;
  })

  // ── Project member me (two aliases: /members/me/ and /project-members/me/) ──
  // Workspace admins always get role 20 even if not explicitly in the project.

  .get("/:project_id/members/me/", async ({ params: { slug, project_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id); // validates access
    const m = await prisma.projectMember.findFirst({
      where: { projectId: project_id, memberId: user.id, deletedAt: null },
    });
    if (m) return { id: m.id, member: m.memberId, role: m.role, original_role: m.role, created_at: m.createdAt.toISOString() };
    // Check if workspace admin
    const wsAdmin = await prisma.workspaceMember.findFirst({
      where: { workspaceId: ws.id, memberId: user.id, role: { gte: 20 }, isActive: true, deletedAt: null },
    });
    if (wsAdmin) return { id: `ws-admin-${user.id}`, member: user.id, role: 20, original_role: 20, created_at: wsAdmin.createdAt.toISOString() };
    set.status = 404; return { detail: "Not a project member." };
  })

  .get("/:project_id/project-members/me/", async ({ params: { slug, project_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id); // validates access
    const m = await prisma.projectMember.findFirst({
      where: { projectId: project_id, memberId: user.id, deletedAt: null },
    });
    if (m) return { id: m.id, member: m.memberId, role: m.role, original_role: m.role, created_at: m.createdAt.toISOString() };
    // Check if workspace admin
    const wsAdmin = await prisma.workspaceMember.findFirst({
      where: { workspaceId: ws.id, memberId: user.id, role: { gte: 20 }, isActive: true, deletedAt: null },
    });
    if (wsAdmin) return { id: `ws-admin-${user.id}`, member: user.id, role: 20, original_role: 20, created_at: wsAdmin.createdAt.toISOString() };
    set.status = 404; return { detail: "Not a project member." };
  })

  // ── Project invitations ────────────────────────────────────────────────────

  .get("/:project_id/invitations/", async ({ params: { slug, project_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { project } = await getProjectOrFail(ws.id, project_id, user.id);
    const where = { projectId: project.id, accepted: false };
    return paginate({
      query: (skip, take) => prisma.projectMemberInvite.findMany({ where, skip, take }),
      count: () => prisma.projectMemberInvite.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .delete("/:project_id/invitations/:pk/", async ({ params: { slug, project_id, pk }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { project, member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }
    await prisma.projectMemberInvite.delete({ where: { id: pk } }).catch(() => {});
    set.status = 204;
    return null;
  })

  // ── Inbox / Intake issues ─────────────────────────────────────────────────────
  // Returns TInboxIssueWithPagination — triage/intake issues (pending review)

  .get("/:project_id/inbox-issues/", async ({params: {slug, project_id}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const perPage = Number(query.per_page ?? 100);
    const cursor  = (query.cursor as string) ?? "100:0:0";
    const page    = Number(cursor.split(":")[1] ?? 0);
    const skip    = page * perPage;

    // Intake issues = issues in triage state
    const triageState = await prisma.state.findFirst({
      where: {projectId: project_id, isTriage: true, deletedAt: null},
    });

    const where: any = {projectId: project_id, deletedAt: null, isDraft: false};
    if (triageState) where.stateId = triageState.id;
    else return { // no triage state → empty intake
      total_count: 0, next_cursor: `${perPage}:1:0`, prev_cursor: `${perPage}:0:1`,
      next_page_results: false, prev_page_results: false, total_results: 0, results: [],
    };

    const [issues, total] = await Promise.all([
      prisma.issue.findMany({
        where, skip, take: perPage + 1,
        include: {state: {select: {id: true, name: true, color: true, group: true}}},
        orderBy: {createdAt: "desc"},
      }),
      prisma.issue.count({where}),
    ]);
    const hasNext = issues.length > perPage;
    const pageIssues = hasNext ? issues.slice(0, perPage) : issues;

    return {
      total_count: total,
      next_cursor: `${perPage}:${page + 1}:0`,
      prev_cursor: `${perPage}:${Math.max(0, page - 1)}:1`,
      next_page_results: hasNext,
      prev_page_results: page > 0,
      total_results: total,
      results: pageIssues.map((i: any) => ({
        id: i.id,
        status: -2, // pending triage
        snoozed_till: null,
        duplicate_to: undefined,
        source: "IN_APP",
        created_by: i.createdById,
        issue: {
          id: i.id,
          name: i.name,
          state_id: i.stateId,
          priority: i.priority,
          project_id: i.projectId,
          workspace_id: i.workspaceId,
          sequence_id: i.sequenceId,
          created_at: i.createdAt?.toISOString(),
          updated_at: i.updatedAt?.toISOString(),
        },
      })),
    };
  })

  .post("/:project_id/inbox-issues/", async ({params: {slug, project_id}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    const {project} = await getProjectOrFail(ws.id, project_id, user.id);
    const b = (body as any).issue ?? body as any;
    const triageState = await prisma.state.findFirst({
      where: {projectId: project_id, isTriage: true, deletedAt: null},
    });
    const issue = await prisma.issue.create({
      data: {
        projectId: project_id, workspaceId: ws.id,
        name: b.name ?? "Novo chamado",
        stateId: triageState?.id ?? null,
        priority: b.priority ?? "none",
        isDraft: false, createdById: user.id,
        ...(b.entity_id ? { entityId: b.entity_id } : {}),
      },
    });
    set.status = 201;
    return {
      id: issue.id, status: -2, snoozed_till: null, duplicate_to: undefined,
      source: "IN_APP", created_by: user.id,
      issue: {id: issue.id, name: issue.name, state_id: issue.stateId, project_id: issue.projectId, sequence_id: issue.sequenceId},
    };
  })

  .get("/:project_id/inbox-issues/:inbox_id/", async ({params: {slug, project_id, inbox_id}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const issue = await prisma.issue.findFirst({where: {id: inbox_id, projectId: project_id, deletedAt: null}});
    if (!issue) { set.status = 404; return {detail: "Not found."}; }
    return {
      id: issue.id, status: -2, snoozed_till: null, duplicate_to: undefined,
      source: "IN_APP", created_by: issue.createdById,
      issue: {id: issue.id, name: issue.name, state_id: issue.stateId, project_id: issue.projectId},
    };
  })

  .patch("/:project_id/inbox-issues/:inbox_id/", async ({params: {slug, project_id, inbox_id}, body, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const b = body as any;
    const data: any = {};
    const issuePatch = b.issue ?? {};
    if (issuePatch.name !== undefined) data.name = issuePatch.name;
    if (issuePatch.state_id !== undefined) data.stateId = issuePatch.state_id;
    if (issuePatch.priority !== undefined) data.priority = issuePatch.priority;
    if (b.status !== undefined && b.status !== -2) {
      // Accepted (0) → move to default state
      const defaultState = await prisma.state.findFirst({where: {projectId: project_id, default: true, deletedAt: null}});
      if (defaultState) data.stateId = defaultState.id;
    }
    const issue = await prisma.issue.update({where: {id: inbox_id}, data});
    return {id: issue.id, status: b.status ?? -2, snoozed_till: null, source: "IN_APP", created_by: issue.createdById,
      issue: {id: issue.id, name: issue.name, state_id: issue.stateId, project_id: issue.projectId}};
  })

  .delete("/:project_id/inbox-issues/:inbox_id/", async ({params: {slug, project_id, inbox_id}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    await prisma.issue.update({where: {id: inbox_id}, data: {deletedAt: new Date()}});
    set.status = 204;
    return null;
  })

  // ── Intake state (triage state for the project) ──────────────────────────────

  .get("/:project_id/intake-state/", async ({ params: { slug, project_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const intakeState = await prisma.state.findFirst({
      where: { projectId: project_id, isTriage: true, deletedAt: null },
    });
    if (!intakeState) return { results: [] };
    return {
      results: [{
        id: intakeState.id,
        name: intakeState.name,
        color: intakeState.color,
        group: intakeState.group,
        project_id: intakeState.projectId,
        workspace_id: intakeState.workspaceId,
      }],
    };
  })

  // ── Project user properties (filters, display settings per user) ─────────────

  .get("/:project_id/user-properties/", async ({params: {slug, project_id}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    const {project} = await getProjectOrFail(ws.id, project_id, user.id);
    const props = await prisma.projectUserProperty.findFirst({
      where: {projectId: project.id, userId: user.id},
    });
    return props
      ? {
          id: props.id,
          project: project.id,
          member: user.id,
          filters: (props.filters as any) ?? {},
          display_filters: (props.displayFilters as any) ?? {},
          display_properties: (props.displayProperties as any) ?? {},
        }
      : {
          id: null, project: project.id, member: user.id,
          filters: {}, display_filters: {}, display_properties: {},
        };
  })

  .patch("/:project_id/user-properties/", async ({params: {slug, project_id}, body, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    const {project} = await getProjectOrFail(ws.id, project_id, user.id);
    const b = body as any;
    const props = await prisma.projectUserProperty.upsert({
      where: {projectId_userId: {projectId: project.id, userId: user.id}},
      create: {
        projectId: project.id, workspaceId: ws.id, userId: user.id,
        filters: b.filters ?? {}, displayFilters: b.display_filters ?? {}, displayProperties: b.display_properties ?? {},
      },
      update: {
        ...(b.filters !== undefined && {filters: b.filters}),
        ...(b.display_filters !== undefined && {displayFilters: b.display_filters}),
        ...(b.display_properties !== undefined && {displayProperties: b.display_properties}),
      },
    });
    return {id: props.id, project: project.id, member: user.id, filters: props.filters, display_filters: props.displayFilters, display_properties: props.displayProperties};
  })

  // ── Project identifier check (/identifier-check/ and legacy /identifiers) ──

  .get("/identifier-check/", async ({ params: { slug }, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    const identifier = (query.identifier as string | undefined)?.toUpperCase();
    if (!identifier) return { status: false };
    const taken = await prisma.project.findFirst({ where: { workspaceId: ws.id, identifier, deletedAt: null } });
    return { status: !taken };
  })

  // ── Backfill: add all workspace members to all workspace projects ─────────────
  // Fixes projects created via migration that have no projectMember records.
  // Only workspace admins can trigger this.

  .post("/sync-members/", async ({ params: { slug }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const requester = await prisma.workspaceMember.findFirst({
      where: { workspaceId: ws.id, memberId: user.id, isActive: true, deletedAt: null },
    });
    if (!requester || requester.role < 20) {
      set.status = 403;
      return { detail: "Only workspace admins can sync project members." };
    }

    const [wsMembers, projects] = await Promise.all([
      prisma.workspaceMember.findMany({
        where: { workspaceId: ws.id, isActive: true, deletedAt: null, role: { gte: 10 } },
        select: { memberId: true, role: true },
      }),
      prisma.project.findMany({
        where: { workspaceId: ws.id, deletedAt: null },
        select: { id: true },
      }),
    ]);

    // Get all existing project member records (to avoid duplicates)
    const existingSet = new Set(
      (await prisma.projectMember.findMany({
        where: { workspaceId: ws.id, deletedAt: null },
        select: { projectId: true, memberId: true },
      })).map(m => `${m.projectId}:${m.memberId}`)
    );

    const toCreate: any[] = [];
    for (const project of projects) {
      for (const wsMember of wsMembers) {
        const key = `${project.id}:${wsMember.memberId}`;
        if (!existingSet.has(key)) {
          toCreate.push({
            projectId: project.id,
            workspaceId: ws.id,
            memberId: wsMember.memberId,
            role: Math.min(wsMember.role, 15),
            isActive: true,
          });
        }
      }
    }

    let added = 0;
    // Batch insert in chunks to avoid timeout
    const CHUNK = 500;
    for (let i = 0; i < toCreate.length; i += CHUNK) {
      const chunk = toCreate.slice(i, i + CHUNK);
      const result = await prisma.projectMember.createMany({ data: chunk, skipDuplicates: true });
      added += result.count;
    }

    return { synced_projects: projects.length, synced_members: wsMembers.length, records_created: added };
  });
