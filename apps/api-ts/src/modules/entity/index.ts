import { Elysia } from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import {
  ENTITY_INCLUDE,
  entityDto,
  findEntityDto,
  readEntityData,
  requireValidEntityData,
} from "@modules/entity/service";
import { createFieldError } from "@utils/field-error";
import { paginate } from "@utils/pagination";
import { getWorkspaceOrFail, requireWorkspaceMember } from "@utils/workspace";
import { EProjectAction, requireWorkspaceAction } from "@utils/permission-checks";

const NAME_REQUIRED = "O nome é obrigatório.";

function buildListWhere(workspaceId: string, query: Record<string, string | undefined>) {
  const where: any = { workspaceId, deletedAt: null };
  if (query.is_active !== undefined) where.isActive = query.is_active === "true";
  if (query.is_frozen !== undefined) where.frozenAt = query.is_frozen === "true" ? { not: null } : null;
  return where;
}

async function findDuplicate(workspaceId: string, name: string) {
  return prisma.entity.findFirst({ where: { workspaceId, name, deletedAt: null }, select: { id: true } });
}

export const entityModule = new Elysia({ prefix: "/workspaces/:slug" })
  .use(authPlugin)

  // Entity CRUD ───────────────────────────────────────────────────────────────

  .get("/entities/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const where = buildListWhere(ws.id, query);
    return paginate({
      query: (skip, take) =>
        prisma.entity.findMany({ where, skip, take, orderBy: { name: "asc" }, include: ENTITY_INCLUDE }),
      count: () => prisma.entity.count({ where }),
      cursor: query.cursor as string | undefined,
      transform: (items) => items.map(entityDto),
    });
  })

  .post("/entities/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceAction(ws.id, user.id, EProjectAction.ENTITY_MANAGE);
    const data = readEntityData((body as any) ?? {});
    if (!data.name) throw createFieldError("name", NAME_REQUIRED);
    await requireValidEntityData(ws.id, data, { id: null, relatedEntityId: null, usesThirdPartyCnpj: false });
    // Nome de entidade é único por workspace (não há índice único no banco, então
    // a checagem é explícita; o P2002 abaixo cobre corrida caso um índice seja criado).
    const duplicate = await findDuplicate(ws.id, data.name as string);
    if (duplicate) {
      set.status = 409;
      return { detail: "Já existe uma entidade com este nome.", id: duplicate.id };
    }
    try {
      const entity = await prisma.entity.create({
        data: { ...(data as any), workspaceId: ws.id, createdById: user.id },
        include: ENTITY_INCLUDE,
      });
      set.status = 201;
      return entityDto(entity);
    } catch (e: any) {
      if (e?.code !== "P2002") throw e;
      set.status = 409;
      return {
        detail: "Já existe uma entidade com este nome.",
        id: (await findDuplicate(ws.id, data.name as string))?.id,
      };
    }
  })

  .get("/entities/:entity_id/", async ({ params: { slug, entity_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return findEntityDto(ws.id, entity_id);
  })

  .patch("/entities/:entity_id/", async ({ params: { slug, entity_id }, body, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceAction(ws.id, user.id, EProjectAction.ENTITY_MANAGE);
    const current = await prisma.entity.findFirst({ where: { id: entity_id, workspaceId: ws.id, deletedAt: null } });
    if (!current) throw { status: 404, message: "Entidade não encontrada." };
    const data = readEntityData((body as any) ?? {});
    if (data.name === null) throw createFieldError("name", NAME_REQUIRED);
    await requireValidEntityData(ws.id, data, current);
    return entityDto(
      await prisma.entity.update({ where: { id: entity_id }, data: data as any, include: ENTITY_INCLUDE })
    );
  })

  .delete("/entities/:entity_id/", async ({ params: { slug, entity_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceAction(ws.id, user.id, EProjectAction.ENTITY_MANAGE);
    await prisma.entity.update({ where: { id: entity_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  });
