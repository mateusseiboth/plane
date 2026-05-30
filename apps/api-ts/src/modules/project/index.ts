import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";
import { getWorkspaceOrFail, requireWorkspaceMember, getProjectOrFail } from "@utils/workspace";

const DEFAULT_STATES = [
  { name: "Backlog", color: "#ff782c", group: "backlog", sequence: 15000, isDefault: true },
  { name: "Todo", color: "#eb5757", group: "unstarted", sequence: 30000 },
  { name: "In Progress", color: "#f59e0b", group: "started", sequence: 45000 },
  { name: "Done", color: "#16a34a", group: "completed", sequence: 60000 },
  { name: "Cancelled", color: "#dc2626", group: "cancelled", sequence: 75000 },
  { name: "Triage", color: "#ff782c", group: "triage", sequence: 90000, isTriage: true },
];

function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export const projectModule = new Elysia({ prefix: "/workspaces/:slug/projects" })
  .use(authPlugin)

  .get("/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where = {
      workspaceId: ws.id,
      deletedAt: null,
      members: { some: { memberId: user.id, isActive: true, deletedAt: null } },
    };
    return paginate({
      query: (skip, take) => prisma.project.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      count: () => prisma.project.count({ where }),
      cursor: query.cursor as string | undefined,
      perPage: query.per_page ? Number(query.per_page) : 100,
    });
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
    return project;
  })

  .get("/:project_id", async ({ params: { slug, project_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { project } = await getProjectOrFail(ws.id, project_id, user.id);
    return project;
  })

  .patch("/:project_id", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }
    return prisma.project.update({ where: { id: project_id }, data: body as any });
  })

  .delete("/:project_id", async ({ params: { slug, project_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 20) { set.status = 403; return { detail: "Only admins can delete projects." }; }
    await prisma.project.update({ where: { id: project_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // ── Project members ────────────────────────────────────────────────────────

  .get("/:project_id/members/", async ({ params: { slug, project_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { project } = await getProjectOrFail(ws.id, project_id, user.id);
    const where = { projectId: project.id, isActive: true, deletedAt: null };
    return paginate({
      query: (skip, take) =>
        prisma.projectMember.findMany({
          where, skip, take,
          include: { member: { select: { id: true, email: true, firstName: true, lastName: true, displayName: true, avatar: true } } },
          orderBy: { createdAt: "asc" },
        }),
      count: () => prisma.projectMember.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/:project_id/members/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { project, member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }
    const b = body as any;
    const members: Array<{ member_id: string; role: number }> = Array.isArray(b) ? b : [b];
    const created = await prisma.projectMember.createMany({
      data: members.map((m: any) => ({
        projectId: project.id, workspaceId: ws.id,
        memberId: m.member_id, role: m.role ?? 5, isActive: true,
      })),
      skipDuplicates: true,
    });
    set.status = 201;
    return { added: created.count };
  })

  .get("/:project_id/members/:pk/", async ({ params: { slug, project_id, pk }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { project } = await getProjectOrFail(ws.id, project_id, user.id);
    const m = await prisma.projectMember.findFirst({
      where: { projectId: project.id, memberId: pk, deletedAt: null },
      include: { member: { select: { id: true, email: true, displayName: true, avatar: true } } },
    });
    if (!m) { set.status = 404; return { detail: "Not found." }; }
    return m;
  })

  .patch("/:project_id/members/:pk/", async ({ params: { slug, project_id, pk }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { project, member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }
    const b = body as any;
    const data: any = {};
    if (b.role !== undefined) data.role = b.role;
    return prisma.projectMember.updateMany({ where: { projectId: project.id, memberId: pk }, data });
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

  // ── Project member me ──────────────────────────────────────────────────────

  .get("/:project_id/members/me/", async ({ params: { slug, project_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { project } = await getProjectOrFail(ws.id, project_id, user.id);
    const m = await prisma.projectMember.findFirst({
      where: { projectId: project.id, memberId: user.id, deletedAt: null },
    });
    if (!m) { set.status = 404; return { detail: "Not a project member." }; }
    return m;
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

  // ── Project identifier check ───────────────────────────────────────────────

  .get("/identifier-check/", async ({ params: { slug }, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    const identifier = (query.identifier as string | undefined)?.toUpperCase();
    if (!identifier) return { status: false };
    const taken = await prisma.project.findFirst({ where: { workspaceId: ws.id, identifier, deletedAt: null } });
    return { status: !taken };
  });
