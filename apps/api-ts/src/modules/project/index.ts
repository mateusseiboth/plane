import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";
import { publishRealtime } from "@utils/realtime";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, recordAudit } from "@utils/audit";
import { nextSequenceId } from "@utils/sequence";
import { getWorkspaceOrFail, requireWorkspaceMember, getProjectOrFail } from "@utils/workspace";
import { EProjectAction, requireProjectAction } from "@utils/permission-checks";
import { notifyQualityOfIntake } from "@utils/notifications";
import { findOrCreateIntake, findTriageState } from "@utils/intake";
import { sincronizarEtiquetas, sincronizarResponsaveis } from "@utils/vinculos-do-chamado";
import { registrarVersaoDaDescricao } from "@utils/versoes-da-descricao";
import { diffChange, recordActivities, type ActivityChange } from "@utils/activity";

// Keep in sync with DEFAULT_STATES in scripts/migrate-sac.ts (pt-BR workflow).
const DEFAULT_STATES = [
  { name: "Triagem",            color: "#6366f1", group: "triage",    sequence: 5000,  isTriage: true },
  { name: "Pendências",         color: "#94a3b8", group: "backlog",   sequence: 10000, isDefault: true },
  { name: "A Fazer",            color: "#64748b", group: "unstarted", sequence: 15000 },
  { name: "Em Análise",         color: "#eab308", group: "started",   sequence: 20000 },
  { name: "Em Desenvolvimento", color: "#3b82f6", group: "started",   sequence: 25000 },
  { name: "Em Teste",           color: "#8b5cf6", group: "started",   sequence: 30000 },
  { name: "Concluído",          color: "#16a34a", group: "completed", sequence: 40000 },
  { name: "Cancelado",          color: "#dc2626", group: "cancelled", sequence: 50000 },
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
    if (!b.name) { set.status = 400; return { detail: "O nome é obrigatório." }; }
    if (!b.identifier) { set.status = 400; return { detail: "O identificador é obrigatório." }; }

    const exists = await prisma.project.findFirst({
      where: { workspaceId: ws.id, identifier: b.identifier.toUpperCase(), deletedAt: null },
    });
    if (exists) { set.status = 409; return { detail: "Já existe um projeto com este identificador." }; }

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
    if (member.role < 15) { set.status = 403; return { detail: "Permissão negada." }; }
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
    if (member.role < 15) { set.status = 403; return { detail: "Permissão negada." }; }
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
    if (member.role < 20) { set.status = 403; return { detail: "Apenas administradores podem excluir projetos." }; }
    await prisma.project.update({ where: { id: project_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  .delete("/:project_id", async ({ params: { slug, project_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 20) { set.status = 403; return { detail: "Apenas administradores podem excluir projetos." }; }
    await prisma.project.update({ where: { id: project_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // ── Arquivar / restaurar projeto ────────────────────────────────────────────
  // Espelha ProjectArchiveUnarchiveEndpoint do Django: arquivar carimba
  // `archived_at` e tira o projeto dos favoritos; restaurar limpa a data.
  // O projeto arquivado continua em /projects/details/ (é de lá que a tela de
  // arquivados se alimenta) e sai de /projects/, usada pelos seletores.

  .post("/:project_id/archive/", async ({ params: { slug, project_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permissão negada." }; }

    const archivedAt = new Date();
    await prisma.$transaction([
      prisma.project.update({ where: { id: project_id }, data: { archivedAt } }),
      prisma.userFavorite.deleteMany({ where: { workspaceId: ws.id, entityId: project_id } }),
    ]);
    return { archived_at: archivedAt.toISOString() };
  })

  .delete("/:project_id/archive/", async ({ params: { slug, project_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permissão negada." }; }

    await prisma.project.update({ where: { id: project_id }, data: { archivedAt: null } });
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

  .post("/:project_id/members/", async ({ params: { slug, project_id }, body, user, set, headers }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { project, member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permissão negada." }; }
    const b = body as any;
    const members: Array<{ member_id: string; role: number }> = Array.isArray(b) ? b : b.members ?? [b];
    const results = [];
    for (const m of members) {
      // A unique de project_members inclui deleted_at, então não existe a chave
      // composta `projectId_memberId` que um upsert exigiria — busca e decide.
      const existing = await prisma.projectMember.findFirst({
        where: { projectId: project.id, memberId: m.member_id, deletedAt: null },
        select: { id: true },
      });
      const created = existing
        ? await prisma.projectMember.update({
            where: { id: existing.id },
            data: { role: m.role ?? 5, isActive: true },
          })
        : await prisma.projectMember.create({
            data: { projectId: project.id, workspaceId: ws.id, memberId: m.member_id, role: m.role ?? 5, isActive: true },
          });
      results.push({ id: created.id, member: created.memberId, role: created.role, original_role: created.role });
      // LGPD: alteração de acesso a dados de um projeto.
      recordAudit({
        workspaceId: ws.id,
        entity: AUDIT_ENTITIES.MEMBER,
        entityId: created.memberId,
        action: AUDIT_ACTIONS.PERMISSION_CHANGE,
        actor: user,
        headers,
        metadata: { project_id, papel: created.role, operacao: existing ? "atualizado" : "adicionado" },
      });
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
    if (!m) { set.status = 404; return { detail: "Não encontrado." }; }
    return { id: m.id, member: m.memberId, role: m.role, original_role: m.role, created_at: m.createdAt.toISOString() };
  })

  .patch("/:project_id/members/:pk/", async ({ params: { slug, project_id, pk }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { project, member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permissão negada." }; }
    const b = body as any;
    const data: any = {};
    if (b.role !== undefined) data.role = b.role;
    await prisma.projectMember.updateMany({ where: { projectId: project.id, memberId: pk }, data });
    const updated = await prisma.projectMember.findFirst({ where: { projectId: project.id, memberId: pk, deletedAt: null } });
    return updated
      ? { id: updated.id, member: updated.memberId, role: updated.role, original_role: updated.role }
      : { detail: "Não encontrado." };
  })

  .delete("/:project_id/members/:pk/", async ({ params: { slug, project_id, pk }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { project, member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permissão negada." }; }
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
    set.status = 404; return { detail: "Você não é membro do projeto." };
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
    set.status = 404; return { detail: "Você não é membro do projeto." };
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
    if (member.role < 15) { set.status = 403; return { detail: "Permissão negada." }; }
    await prisma.projectMemberInvite.delete({ where: { id: pk } }).catch(() => {});
    set.status = 204;
    return null;
  })

  // ── Issue search (used by the "add relation" / blocked-by modal) ─────────────
  .get("/:project_id/search-issues/", async ({params: {slug, project_id}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);

    const search = String(query.search ?? "").trim();
    const excludeId = query.issue_id as string | undefined;
    const workspaceSearch = query.workspace_search === "true";

    const where: any = {workspaceId: ws.id, deletedAt: null, isDraft: false};
    if (!workspaceSearch) where.projectId = project_id;
    if (excludeId) where.id = {not: excludeId};
    if (search) {
      const or: any[] = [{name: {contains: search, mode: "insensitive"}}];
      const num = parseInt(search.replace(/\D/g, ""), 10);
      if (!isNaN(num)) or.push({sequenceId: num});
      where.OR = or;
    }

    const issues = await prisma.issue.findMany({
      where,
      take: 100,
      orderBy: {updatedAt: "desc"},
      include: {
        state: {select: {name: true, color: true, group: true}},
        project: {select: {identifier: true, name: true}},
      },
    });

    return issues.map((i: any) => ({
      id: i.id,
      name: i.name,
      project_id: i.projectId,
      project__identifier: i.project?.identifier ?? "",
      project__name: i.project?.name ?? "",
      sequence_id: i.sequenceId ?? 0,
      start_date: i.startDate ? i.startDate.toISOString().split("T")[0] : null,
      state__color: i.state?.color ?? "",
      state__group: i.state?.group ?? "backlog",
      state__name: i.state?.name ?? "",
      workspace__slug: slug,
      type_id: null,
    }));
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

    // Status filter from frontend: -2=pending, -1=declined, 0=snoozed, 1=accepted, 2=duplicate
    const statusFilter: number[] | null = (query as any).status
      ? String((query as any).status).split(",").map(Number)
      : null;

    // Use IntakeIssue as primary source so closed (declined/accepted) items are also visible
    // `issue.deletedAt: null` além do próprio: apagar o chamado deixava a
    // solicitação viva numa fila que ninguém consegue atender, porque o chamado
    // por trás dela não existe mais.
    const iiWhere: any = {projectId: project_id, deletedAt: null, issue: {deletedAt: null}};
    if (statusFilter) iiWhere.status = {in: statusFilter};

    const [intakeIssues, total] = await Promise.all([
      prisma.intakeIssue.findMany({
        where: iiWhere, skip, take: perPage + 1,
        include: {issue: {include: {state: {select: {id: true, group: true}}}}},
        orderBy: {createdAt: "desc"},
      }),
      prisma.intakeIssue.count({where: iiWhere}),
    ]);

    // If no IntakeIssue records exist yet, fall back to triage state query (legacy behaviour)
    if (total === 0 && !statusFilter) {
      const triageState = await findTriageState(project_id);
      if (!triageState) return {total_count: 0, total_results: 0, next_cursor: `${perPage}:1:0`, prev_cursor: `${perPage}:0:1`, next_page_results: false, prev_page_results: false, results: []};
      const issues = await prisma.issue.findMany({
        where: {projectId: project_id, stateId: triageState.id, deletedAt: null, isDraft: false},
        take: perPage, orderBy: {createdAt: "desc"},
        include: {state: {select: {group: true}}},
      });
      return {
        total_count: issues.length, total_results: issues.length,
        next_cursor: `${perPage}:1:0`, prev_cursor: `${perPage}:0:1`,
        next_page_results: false, prev_page_results: false,
        results: issues.map((i: any) => ({
          id: i.id, status: -2, snoozed_till: null, duplicate_to: undefined, source: "IN_APP", created_by: i.createdById,
          issue: {id: i.id, name: i.name, state_id: i.stateId, priority: i.priority, project_id: i.projectId, workspace_id: i.workspaceId, sequence_id: i.sequenceId, description_html: i.descriptionHtml ?? "<p></p>", created_at: i.createdAt?.toISOString(), updated_at: i.updatedAt?.toISOString()},
        })),
      };
    }

    const hasNext = intakeIssues.length > perPage;
    const pageItems = hasNext ? intakeIssues.slice(0, perPage) : intakeIssues;

    return {
      total_count: total, total_results: total,
      next_cursor: `${perPage}:${page + 1}:0`,
      prev_cursor: `${perPage}:${Math.max(0, page - 1)}:1`,
      next_page_results: hasNext, prev_page_results: page > 0,
      results: pageItems.map((ii: any) => {
        const i = ii.issue;
        if (!i) return null;
        return {
          id: i.id, status: ii.status ?? -2,
          snoozed_till: ii.snoozeTill ?? null,
          duplicate_to: ii.duplicateOf ?? undefined,
          source: ii.source ?? "IN_APP",
          created_by: i.createdById,
          issue: {
            id: i.id, name: i.name, state_id: i.stateId, priority: i.priority,
            project_id: i.projectId, workspace_id: i.workspaceId, sequence_id: i.sequenceId,
            description_html: i.descriptionHtml ?? "<p></p>",
            created_at: i.createdAt?.toISOString(), updated_at: i.updatedAt?.toISOString(),
          },
        };
      }).filter(Boolean),
    };
  })

  .post("/:project_id/inbox-issues/", async ({params: {slug, project_id}, body, user, set, headers}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.INTAKE_CREATE);
    const b = (body as any).issue ?? body as any;
    const triageState = await findTriageState(project_id);
    const sequenceId = await nextSequenceId(prisma, project_id);
    const issue = await prisma.issue.create({
      data: {
        projectId: project_id, workspaceId: ws.id, sequenceId,
        name: b.name ?? "Novo chamado",
        stateId: triageState?.id ?? null,
        priority: b.priority ?? "none",
        isDraft: false, createdById: user.id,
        ...(b.description_html !== undefined
          ? {descriptionHtml: b.description_html, descriptionStripped: String(b.description_html).replace(/<[^>]+>/g, "")}
          : {}),
        ...(b.entity_id ? {entityId: b.entity_id} : {}),
      },
    });
    const intake = await findOrCreateIntake(project_id, ws.id);
    await prisma.intakeIssue.create({
      data: {intakeId: intake.id, issueId: issue.id, workspaceId: ws.id, projectId: project_id, status: -2, source: "in-app"},
    });
    // Auto-assign the creator (+ any explicit assignee_ids), mirroring issue create.
    const assigneeIds: string[] = b.assignee_ids ?? b.assignees ?? [];
    const assigneeSet = new Set<string>([user.id, ...assigneeIds]);
    await prisma.issueAssignee.createMany({
      data: Array.from(assigneeSet).map((uid) => ({issueId: issue.id, assigneeId: uid, workspaceId: ws.id, projectId: project_id})),
      skipDuplicates: true,
    });
    // D3: notify Quality-team members of the project that a new intake was opened
    await notifyQualityOfIntake({workspaceId: ws.id, projectId: project_id, issueId: issue.id, actorId: user.id, issueName: issue.name});
    publishRealtime(ws.id, {entity: "intake", action: "create", project_id, id: issue.id, issue_id: issue.id, actor: user.id});
    publishRealtime(ws.id, {entity: "issue", action: "create", project_id, id: issue.id, actor: user.id});
    // LGPD: abertura de solicitação (pedido de chamado) pelo cliente.
    recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.INTAKE,
      entityId: issue.id,
      action: AUDIT_ACTIONS.CREATE,
      actor: user,
      headers,
      metadata: {project_id, name: issue.name},
    });
    set.status = 201;
    return {
      id: issue.id, status: -2, snoozed_till: null, duplicate_to: undefined,
      source: "IN_APP", created_by: user.id,
      issue: {id: issue.id, name: issue.name, state_id: issue.stateId, project_id: issue.projectId, sequence_id: issue.sequenceId},
    };
  })

  .get("/:project_id/inbox-issues/:inbox_id/", async ({params: {slug, project_id, inbox_id}, user, set, headers}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const issue = await prisma.issue.findFirst({
      where: {id: inbox_id, projectId: project_id, deletedAt: null},
      include: {state: {select: {group: true}}},
    });
    if (!issue) { set.status = 404; return {detail: "Não encontrado."}; }
    const ii = await prisma.intakeIssue.findFirst({where: {issueId: inbox_id, deletedAt: null}}) as any;
    const stateGroup = issue.state?.group ?? "triage";
    const derivedStatus = stateGroup === "triage" ? -2 : stateGroup === "cancelled" ? -1 : 1;
    const status = ii ? ii.status : derivedStatus;
    // LGPD: visualização de solicitação.
    recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.INTAKE,
      entityId: issue.id,
      action: AUDIT_ACTIONS.VIEW,
      actor: user,
      headers,
      metadata: {project_id, sequence_id: issue.sequenceId},
    });
    return {
      id: issue.id, status,
      snoozed_till: ii?.snoozeTill ?? null,
      duplicate_to: ii?.duplicateOf ?? undefined,
      source: ii?.source ?? "IN_APP",
      created_by: issue.createdById,
      issue: {
        id: issue.id, name: issue.name, state_id: issue.stateId,
        priority: issue.priority, project_id: issue.projectId,
        workspace_id: issue.workspaceId, sequence_id: issue.sequenceId,
        description_html: issue.descriptionHtml ?? "<p></p>",
        created_at: issue.createdAt?.toISOString(), updated_at: issue.updatedAt?.toISOString(),
      },
    };
  })

  .patch("/:project_id/inbox-issues/:inbox_id/", async ({params: {slug, project_id, inbox_id}, body, user, set, headers}) => {
    const ws = await getWorkspaceOrFail(slug);
    const {member: callerMember} = await getProjectOrFail(ws.id, project_id, user.id);
    const b = body as any;
    const issuePatch = b.issue ?? {};

    const antes = await prisma.issue.findFirst({
      where: {id: inbox_id, deletedAt: null},
      include: {state: {select: {group: true}}},
    });

    // A triagem também reescreve o corpo — o Qualidade limpa o relato do
    // cliente. O que era antes fica gravado. Ver @utils/versoes-da-descricao.
    const abriuVersao = await registrarVersaoDaDescricao({antes, corpo: issuePatch, autorId: user.id});

    // FULFILLED (3) = "atendido": closes the intake. Only the chamado's creator or a
    // project admin/gestor (role ≥ 18) may set it, and only once the work item is
    // actually completed. Accepted (1) intakes stay in the OPEN tab until then.
    if (b.status === 3) {
      const isCreator = antes?.createdById === user.id;
      const isManager = (callerMember?.role ?? 0) >= 18;
      if (!isCreator && !isManager) {
        set.status = 403;
        return {detail: "Apenas o criador do chamado ou um gestor pode marcar como atendido."};
      }
      if (antes?.state?.group !== "completed") {
        set.status = 400;
        return {detail: "O work item precisa estar Concluído antes de marcar o chamado como atendido."};
      }
    }

    const issueData: any = {};
    if (issuePatch.name !== undefined) issueData.name = issuePatch.name;
    if (issuePatch.state_id !== undefined) issueData.stateId = issuePatch.state_id;
    if (issuePatch.priority !== undefined) issueData.priority = issuePatch.priority;
    if (issuePatch.description_html !== undefined) {
      issueData.descriptionHtml = issuePatch.description_html;
      issueData.descriptionStripped = (issuePatch.description_html ?? "").replace(/<[^>]+>/g, "");
    }
    // O JSON do editor acompanha o HTML; ver o PATCH do chamado.
    const descricaoJson = issuePatch.description_json !== undefined ? issuePatch.description_json : issuePatch.description;
    if (descricaoJson !== undefined) issueData.descriptionJson = descricaoJson;
    if (issuePatch.label_ids !== undefined) issueData._labelIds = issuePatch.label_ids; // handled after update
    if (issuePatch.assignee_ids !== undefined) issueData._assigneeIds = issuePatch.assignee_ids; // handled after update

    // Intake decision drives the work item's state:
    //   accepted (1)  → "Em Análise" (enters the active workflow)
    //   declined (-1) → "Cancelado"
    // Snoozed/duplicate and the default keep it in "Triagem".
    if (b.status === 1 || b.status === -1) {
      const targetName = b.status === 1 ? "Em Análise" : "Cancelado";
      const targetState = await prisma.state.findFirst({
        where: {projectId: project_id, name: targetName, deletedAt: null},
        select: {id: true},
      });
      // Fall back to the project default only if the canonical state is missing.
      const fallback =
        b.status === 1
          ? await prisma.state.findFirst({where: {projectId: project_id, default: true, deletedAt: null}, select: {id: true}})
          : null;
      const resolved = targetState ?? fallback;
      if (resolved) issueData.stateId = resolved.id;
    }

    // Extract relation arrays before update (they can't go directly into prisma.update)
    const labelIds: string[] | undefined = issueData._labelIds;
    const assigneeIds: string[] | undefined = issueData._assigneeIds;
    delete issueData._labelIds;
    delete issueData._assigneeIds;

    // Quem alterou o chamado fica gravado — o título pode ser mexido por
    // terceiro, mas nunca de forma anônima.
    const alterouOChamado = Object.keys(issueData).length > 0;
    if (alterouOChamado) issueData.updatedById = user.id;

    const issue = alterouOChamado
      ? await prisma.issue.update({where: {id: inbox_id}, data: issueData})
      : await prisma.issue.findFirst({where: {id: inbox_id}});

    // Título e descrição editados entram no histórico do chamado, no mesmo
    // padrão do PATCH principal (campos `name`/`description`, com autor).
    if (antes) {
      const mudancas: ActivityChange[] = [];
      const mudancaDeTitulo =
        issuePatch.name !== undefined ? diffChange("name", antes.name, issuePatch.name, "updated the name") : null;
      if (mudancaDeTitulo) mudancas.push(mudancaDeTitulo);
      if (abriuVersao) mudancas.push({field: "description", comment: "updated the description"});
      if (mudancas.length) {
        await recordActivities(
          {issueId: inbox_id, workspaceId: ws.id, projectId: project_id, actorId: user.id},
          mudancas,
        );
      }
    }

    const escopoDoVinculo = {issueId: inbox_id, workspaceId: ws.id, projectId: project_id};
    if (labelIds !== undefined) await sincronizarEtiquetas(escopoDoVinculo, labelIds);
    if (assigneeIds !== undefined) await sincronizarResponsaveis(escopoDoVinculo, assigneeIds);

    // Update or create IntakeIssue to persist status, snoozeTill, duplicateOf
    const iiData: any = {};
    if (b.status !== undefined) iiData.status = b.status;
    if (b.duplicate_to !== undefined) iiData.duplicateOf = b.duplicate_to;
    if (b.snoozed_till !== undefined) iiData.snoozeTill = b.snoozed_till ? new Date(b.snoozed_till) : null;

    let ii: any = null;
    if (Object.keys(iiData).length) {
      const existing = await prisma.intakeIssue.findFirst({where: {issueId: inbox_id, deletedAt: null}});
      if (existing) {
        ii = await prisma.intakeIssue.update({where: {id: existing.id}, data: iiData});
      } else {
        const intake = await findOrCreateIntake(project_id, ws.id);
        ii = await prisma.intakeIssue.create({
          data: {intakeId: intake.id, issueId: inbox_id, workspaceId: ws.id, projectId: project_id, source: "in-app", ...iiData},
        });
      }
    }

    const result = {
      id: issue!.id, status: ii?.status ?? b.status ?? -2,
      snoozed_till: ii?.snoozeTill ?? null,
      duplicate_to: ii?.duplicateOf ?? undefined,
      source: ii?.source ?? "IN_APP",
      created_by: issue!.createdById,
      issue: {
        id: issue!.id, name: (issue as any).name, state_id: (issue as any).stateId, project_id: (issue as any).projectId,
        description_html: (issue as any).descriptionHtml ?? "<p></p>",
        priority: (issue as any).priority,
      },
    };
    publishRealtime(ws.id, {entity: "intake", action: "update", project_id, id: inbox_id, issue_id: inbox_id, actor: user.id});
    publishRealtime(ws.id, {entity: "issue", action: "update", project_id, id: inbox_id, actor: user.id});
    // LGPD: triagem da solicitação (aceite/recusa/snooze) muda o destino do pedido.
    recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.INTAKE,
      entityId: inbox_id,
      action: AUDIT_ACTIONS.UPDATE,
      actor: user,
      headers,
      metadata: {project_id, status: result.status, campos: Object.keys(b ?? {})},
    });
    return result;
  })

  .delete("/:project_id/inbox-issues/:inbox_id/", async ({params: {slug, project_id, inbox_id}, user, set, headers}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    await prisma.issue.update({where: {id: inbox_id}, data: {deletedAt: new Date()}});
    recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.INTAKE,
      entityId: inbox_id,
      action: AUDIT_ACTIONS.DELETE,
      actor: user,
      headers,
      metadata: {project_id},
    });
    const ii = await prisma.intakeIssue.findFirst({where: {issueId: inbox_id, deletedAt: null}});
    if (ii) await prisma.intakeIssue.update({where: {id: ii.id}, data: {deletedAt: new Date()}});
    publishRealtime(ws.id, {entity: "intake", action: "delete", project_id, id: inbox_id, issue_id: inbox_id, actor: user.id});
    publishRealtime(ws.id, {entity: "issue", action: "delete", project_id, id: inbox_id, actor: user.id});
    set.status = 204;
    return null;
  })

  // ── Intake state (triage state for the project) ──────────────────────────────

  .get("/:project_id/intake-state/", async ({ params: { slug, project_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const intakeState = await findTriageState(project_id);
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
      return { detail: "Apenas administradores do workspace podem sincronizar membros do projeto." };
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
  })

  // ── Backfill: add Avaliando + Em Teste states to existing projects ────────────
  // POST /workspaces/:slug/projects/backfill-states/
  .post("/backfill-states/", async ({ params: { slug }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);

    const NEW_STATES = [
      { name: "Avaliando", color: "#a855f7", group: "unstarted", sequence: 25000 },
      { name: "Em Teste",  color: "#ec4899", group: "started",   sequence: 50000 },
    ];

    const projects = await prisma.project.findMany({
      where: { workspaceId: ws.id, deletedAt: null },
      select: { id: true },
    });

    let created = 0;
    for (const project of projects) {
      const existingNames = (await prisma.state.findMany({
        where: { projectId: project.id, deletedAt: null },
        select: { name: true },
      })).map((s: any) => s.name);

      for (const s of NEW_STATES) {
        if (!existingNames.includes(s.name)) {
          await prisma.state.create({
            data: { ...s, projectId: project.id, workspaceId: ws.id, slug: s.name.toLowerCase().replace(/\s+/g, "-") },
          });
          created++;
        }
      }
    }

    return { projects_checked: projects.length, states_created: created };
  })

  // ── Comment reactions ─────────────────────────────────────────────────────────
  // Frontend calls: /api/workspaces/:slug/projects/:project_id/comments/:comment_id/reactions/

  .get("/:project_id/comments/:comment_id/reactions/", async ({params: {slug, project_id, comment_id}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const reactions = await prisma.commentReaction.findMany({
      where: {commentId: comment_id, deletedAt: null},
      include: {actor: {select: {id: true, displayName: true, avatarUrl: true}}},
    });
    return reactions.map((r: any) => ({
      id: r.id, comment: comment_id, reaction: r.reaction,
      actor: r.actor.id,
      actor_detail: {id: r.actor.id, display_name: r.actor.displayName, avatar_url: r.actor.avatarUrl},
    }));
  })

  .post("/:project_id/comments/:comment_id/reactions/", async ({params: {slug, project_id, comment_id}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const b = body as any;
    if (!b.reaction) { set.status = 400; return {detail: "reaction é obrigatório."}; }
    const existing = await prisma.commentReaction.findFirst({
      where: {commentId: comment_id, actorId: user.id, reaction: b.reaction, deletedAt: null},
    });
    if (existing) { set.status = 409; return {detail: "Você já reagiu."}; }
    const r = await prisma.commentReaction.create({
      data: {commentId: comment_id, actorId: user.id, workspaceId: ws.id, projectId: project_id, reaction: b.reaction},
    });
    set.status = 201;
    return {id: r.id, comment: comment_id, reaction: r.reaction, actor: user.id};
  })

  .delete("/:project_id/comments/:comment_id/reactions/:reaction/", async ({params: {slug, project_id, comment_id, reaction}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    await prisma.commentReaction.updateMany({
      where: {commentId: comment_id, actorId: user.id, reaction, deletedAt: null},
      data: {deletedAt: new Date()},
    });
    set.status = 204;
    return null;
  });
