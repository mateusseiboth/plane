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
  });
