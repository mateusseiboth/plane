import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { getWorkspaceOrFail, getProjectOrFail } from "@utils/workspace";

function labelDto(l: any) {
  return {
    id: l.id,
    name: l.name,
    color: l.color ?? "",
    description: l.description ?? "",
    parent: l.parentId ?? null,
    sort_order: l.sortOrder ?? 65535,
    project_id: l.projectId,
    workspace_id: l.workspaceId,
    created_at: l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
    updated_at: l.updatedAt instanceof Date ? l.updatedAt.toISOString() : l.updatedAt,
  };
}

// Handles both /labels/ and /issue-labels/ paths via two module registrations
function buildLabelModule(prefix: string) {
  return new Elysia({ prefix })
    .use(authPlugin)

    .get("/", async ({ params: { slug, project_id }, user }) => {
      const ws = await getWorkspaceOrFail(slug);
      await getProjectOrFail(ws.id, project_id, user.id);
      const labels = await prisma.label.findMany({
        where: { projectId: project_id, deletedAt: null },
        orderBy: { sortOrder: "asc" },
      });
      return labels.map(labelDto);
    })

    .post("/", async ({ params: { slug, project_id }, body, user, set }) => {
      const ws = await getWorkspaceOrFail(slug);
      const { member } = await getProjectOrFail(ws.id, project_id, user.id);
      if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }
      const b = body as any;
      if (!b.name) { set.status = 400; return { detail: "Name is required." }; }
      const label = await prisma.label.create({
        data: {
          workspaceId: ws.id, projectId: project_id,
          name: b.name, description: b.description ?? "", color: b.color ?? "",
          parentId: b.parent ?? null,
          externalSource: b.external_source ?? null, externalId: b.external_id ?? null,
          createdById: user.id,
        },
      });
      set.status = 201;
      return labelDto(label);
    })

    .get("/:label_id/", async ({ params: { slug, project_id, label_id }, user }) => {
      const ws = await getWorkspaceOrFail(slug);
      await getProjectOrFail(ws.id, project_id, user.id);
      const l = await prisma.label.findFirstOrThrow({ where: { id: label_id, projectId: project_id, deletedAt: null } });
      return labelDto(l);
    })

    .get("/:label_id", async ({ params: { slug, project_id, label_id }, user }) => {
      const ws = await getWorkspaceOrFail(slug);
      await getProjectOrFail(ws.id, project_id, user.id);
      const l = await prisma.label.findFirstOrThrow({ where: { id: label_id, projectId: project_id, deletedAt: null } });
      return labelDto(l);
    })

    .patch("/:label_id/", async ({ params: { slug, project_id, label_id }, body, user, set }) => {
      const ws = await getWorkspaceOrFail(slug);
      const { member } = await getProjectOrFail(ws.id, project_id, user.id);
      if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }
      const b = body as any;
      const data: any = {};
      if (b.name !== undefined) data.name = b.name;
      if (b.color !== undefined) data.color = b.color;
      if (b.description !== undefined) data.description = b.description;
      if (b.parent !== undefined) data.parentId = b.parent;
      const l = await prisma.label.update({ where: { id: label_id }, data });
      return labelDto(l);
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
      const l = await prisma.label.update({ where: { id: label_id }, data });
      return labelDto(l);
    })

    .delete("/:label_id/", async ({ params: { slug, project_id, label_id }, user, set }) => {
      const ws = await getWorkspaceOrFail(slug);
      const { member } = await getProjectOrFail(ws.id, project_id, user.id);
      if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }
      await prisma.label.update({ where: { id: label_id }, data: { deletedAt: new Date() } });
      set.status = 204;
      return null;
    })

    .delete("/:label_id", async ({ params: { slug, project_id, label_id }, user, set }) => {
      const ws = await getWorkspaceOrFail(slug);
      const { member } = await getProjectOrFail(ws.id, project_id, user.id);
      if (member.role < 15) { set.status = 403; return { detail: "Permission denied." }; }
      await prisma.label.update({ where: { id: label_id }, data: { deletedAt: new Date() } });
      set.status = 204;
      return null;
    });
}

export const labelModule     = buildLabelModule("/workspaces/:slug/projects/:project_id/labels");
export const issueLabelModule = buildLabelModule("/workspaces/:slug/projects/:project_id/issue-labels");
