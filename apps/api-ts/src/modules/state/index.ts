import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";
import { getWorkspaceOrFail, getProjectOrFail } from "@utils/workspace";

function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export const stateModule = new Elysia({ prefix: "/workspaces/:slug/projects/:project_id/states" })
  .use(authPlugin)

  .get("/", async ({ params: { slug, project_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where = { projectId: project_id, deletedAt: null, isTriage: false };
    return paginate({
      query: (skip, take) => prisma.state.findMany({ where, skip, take, orderBy: { sequence: "asc" } }),
      count: () => prisma.state.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }

    const b = body as any;
    if (!b.name) { set.status = 400; return { detail: "Name is required." }; }

    const exists = await prisma.state.findFirst({
      where: { projectId: project_id, name: b.name, deletedAt: null },
    });
    if (exists) { set.status = 409; return { detail: "State with this name already exists.", id: exists.id }; }

    const lastSeq = await prisma.state.findFirst({
      where: { projectId: project_id },
      orderBy: { sequence: "desc" },
      select: { sequence: true },
    });

    const state = await prisma.state.create({
      data: {
        projectId: project_id,
        workspaceId: ws.id,
        name: b.name,
        description: b.description ?? "",
        color: b.color ?? "#ff782c",
        group: b.group ?? "backlog",
        sequence: (lastSeq?.sequence ?? 0) + 15000,
        default: b.default ?? false,
        slug: slugify(b.name),
        externalSource: b.external_source ?? null,
        externalId: b.external_id ?? null,
        createdById: user.id,
      },
    });

    set.status = 201;
    return state;
  })

  .get("/:state_id", async ({ params: { slug, project_id, state_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    return prisma.state.findFirstOrThrow({ where: { id: state_id, projectId: project_id, deletedAt: null } });
  })

  .patch("/:state_id", async ({ params: { slug, project_id, state_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }

    const b = body as any;
    const data: any = {};
    if (b.name !== undefined) { data.name = b.name; data.slug = slugify(b.name); }
    if (b.color !== undefined) data.color = b.color;
    if (b.group !== undefined) data.group = b.group;
    if (b.description !== undefined) data.description = b.description;
    if (b.default !== undefined) data.default = b.default;
    if (b.sequence !== undefined) data.sequence = b.sequence;

    return prisma.state.update({ where: { id: state_id }, data });
  })

  .delete("/:state_id", async ({ params: { slug, project_id, state_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 20) { set.status = 403; return { detail: "Only admins can delete states." }; }

    const state = await prisma.state.findFirstOrThrow({ where: { id: state_id, projectId: project_id } });
    if (state.default) { set.status = 400; return { detail: "Default state cannot be deleted." }; }

    const issueCount = await prisma.issue.count({ where: { stateId: state_id, deletedAt: null } });
    if (issueCount > 0) { set.status = 400; return { detail: "The state is not empty, only empty states can be deleted." }; }

    await prisma.state.update({ where: { id: state_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  });
