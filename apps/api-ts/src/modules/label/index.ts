import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";
import { getWorkspaceOrFail, getProjectOrFail } from "@utils/workspace";

export const labelModule = new Elysia({ prefix: "/workspaces/:slug/projects/:project_id/labels" })
  .use(authPlugin)

  .get("/", async ({ params: { slug, project_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where = { projectId: project_id, deletedAt: null };
    return paginate({
      query: (skip, take) => prisma.label.findMany({ where, skip, take, orderBy: { sortOrder: "asc" } }),
      count: () => prisma.label.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }

    const b = body as any;
    if (!b.name) { set.status = 400; return { detail: "Name is required." }; }

    const label = await prisma.label.create({
      data: {
        workspaceId: ws.id,
        projectId: project_id,
        name: b.name,
        description: b.description ?? "",
        color: b.color ?? "",
        parentId: b.parent ?? null,
        externalSource: b.external_source ?? null,
        externalId: b.external_id ?? null,
        createdById: user.id,
      },
    });

    set.status = 201;
    return label;
  })

  .get("/:label_id", async ({ params: { slug, project_id, label_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    return prisma.label.findFirstOrThrow({ where: { id: label_id, projectId: project_id, deletedAt: null } });
  })

  .patch("/:label_id", async ({ params: { slug, project_id, label_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }

    const b = body as any;
    const data: any = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.color !== undefined) data.color = b.color;
    if (b.description !== undefined) data.description = b.description;
    if (b.parent !== undefined) data.parentId = b.parent;

    return prisma.label.update({ where: { id: label_id }, data });
  })

  .delete("/:label_id", async ({ params: { slug, project_id, label_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }
    await prisma.label.update({ where: { id: label_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  });
