import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { getWorkspaceOrFail, getProjectOrFail } from "@utils/workspace";

function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function stateDto(s: any) {
  return {
    id: s.id,
    name: s.name,
    color: s.color,
    group: s.group,
    description: s.description ?? "",
    sequence: s.sequence,
    default: s.default,
    slug: s.slug,
    order: s.sequence,
    project_id: s.projectId,
    workspace_id: s.workspaceId,
    created_at: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
    updated_at: s.updatedAt instanceof Date ? s.updatedAt.toISOString() : s.updatedAt,
  };
}

export const stateModule = new Elysia({ prefix: "/workspaces/:slug/projects/:project_id/states" })
  .use(authPlugin)

  .get("/", async ({ params: { slug, project_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const states = await prisma.state.findMany({
      where: { projectId: project_id, deletedAt: null, isTriage: false },
      orderBy: { sequence: "asc" },
    });
    return states.map(stateDto);
  })

  .post("/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permissão negada." }; }
    const b = body as any;
    if (!b.name) { set.status = 400; return { detail: "O nome é obrigatório." }; }
    const exists = await prisma.state.findFirst({ where: { projectId: project_id, name: b.name, deletedAt: null } });
    if (exists) { set.status = 409; return { detail: "Já existe um estado com este nome.", id: exists.id }; }
    const lastSeq = await prisma.state.findFirst({ where: { projectId: project_id }, orderBy: { sequence: "desc" }, select: { sequence: true } });
    const state = await prisma.state.create({
      data: {
        projectId: project_id, workspaceId: ws.id,
        name: b.name, description: b.description ?? "", color: b.color ?? "#ff782c",
        group: b.group ?? "backlog", sequence: (lastSeq?.sequence ?? 0) + 15000,
        default: b.default ?? false, slug: slugify(b.name),
        externalSource: b.external_source ?? null, externalId: b.external_id ?? null,
        createdById: user.id,
      },
    });
    set.status = 201;
    return stateDto(state);
  })

  .get("/:state_id/", async ({ params: { slug, project_id, state_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const s = await prisma.state.findFirstOrThrow({ where: { id: state_id, projectId: project_id, deletedAt: null } });
    return stateDto(s);
  })

  .get("/:state_id", async ({ params: { slug, project_id, state_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const s = await prisma.state.findFirstOrThrow({ where: { id: state_id, projectId: project_id, deletedAt: null } });
    return stateDto(s);
  })

  .patch("/:state_id/", async ({ params: { slug, project_id, state_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permissão negada." }; }
    const b = body as any;
    const data: any = {};
    if (b.name !== undefined) { data.name = b.name; data.slug = slugify(b.name); }
    if (b.color !== undefined) data.color = b.color;
    if (b.group !== undefined) data.group = b.group;
    if (b.description !== undefined) data.description = b.description;
    if (b.default !== undefined) data.default = b.default;
    if (b.sequence !== undefined) data.sequence = b.sequence;
    const s = await prisma.state.update({ where: { id: state_id }, data });
    return stateDto(s);
  })

  .patch("/:state_id", async ({ params: { slug, project_id, state_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permissão negada." }; }
    const b = body as any;
    const data: any = {};
    if (b.name !== undefined) { data.name = b.name; data.slug = slugify(b.name); }
    if (b.color !== undefined) data.color = b.color;
    if (b.group !== undefined) data.group = b.group;
    if (b.description !== undefined) data.description = b.description;
    if (b.default !== undefined) data.default = b.default;
    if (b.sequence !== undefined) data.sequence = b.sequence;
    const s = await prisma.state.update({ where: { id: state_id }, data });
    return stateDto(s);
  })

  .post("/:state_id/mark-default/", async ({ params: { slug, project_id, state_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 15) { set.status = 403; return { detail: "Permissão negada." }; }
    const exists = await prisma.state.findFirst({ where: { id: state_id, projectId: project_id, deletedAt: null } });
    if (!exists) { set.status = 404; return { detail: "Estado não encontrado." }; }
    await prisma.$transaction(async tx => {
      await tx.state.updateMany({ where: { projectId: project_id }, data: { default: false } });
      await tx.state.update({ where: { id: state_id }, data: { default: true } });
    });
    const s = await prisma.state.findFirstOrThrow({ where: { id: state_id } });
    return stateDto(s);
  })

  .delete("/:state_id/", async ({ params: { slug, project_id, state_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 20) { set.status = 403; return { detail: "Apenas administradores podem excluir estados." }; }
    const state = await prisma.state.findFirstOrThrow({ where: { id: state_id, projectId: project_id } });
    if (state.default) { set.status = 400; return { detail: "O estado padrão não pode ser excluído." }; }
    const issueCount = await prisma.issue.count({ where: { stateId: state_id, deletedAt: null } });
    if (issueCount > 0) { set.status = 400; return { detail: "O estado não está vazio; apenas estados vazios podem ser excluídos." }; }
    await prisma.state.update({ where: { id: state_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  .delete("/:state_id", async ({ params: { slug, project_id, state_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    const { member } = await getProjectOrFail(ws.id, project_id, user.id);
    if (member.role < 20) { set.status = 403; return { detail: "Apenas administradores podem excluir estados." }; }
    const state = await prisma.state.findFirstOrThrow({ where: { id: state_id, projectId: project_id } });
    if (state.default) { set.status = 400; return { detail: "O estado padrão não pode ser excluído." }; }
    const issueCount = await prisma.issue.count({ where: { stateId: state_id, deletedAt: null } });
    if (issueCount > 0) { set.status = 400; return { detail: "O estado não está vazio; apenas estados vazios podem ser excluídos." }; }
    await prisma.state.update({ where: { id: state_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  });
