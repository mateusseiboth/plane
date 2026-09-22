import { Elysia } from "elysia";
import { authPlugin, type AuthUser } from "@middleware/auth";
import prisma from "@db";
import {
  ENTITY_INCLUDE,
  entityDto,
  findEntityDto,
  readEntityData,
  requireValidEntityData,
} from "@modules/entity/service";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, auditDiff, recordAudit } from "@utils/audit";
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

// Campos que a trilha registra com o valor. Dado de órgão público, não pessoal.
const AUDITED_FIELDS = [
  "name",
  "entityType",
  "cnpj",
  "stateRegistration",
  "street",
  "addressNumber",
  "complement",
  "district",
  "zipCode",
  "city",
  "state",
  "email",
  "phone",
  "fax",
  "website",
  "representativeId",
  "relatedEntityId",
  "usesThirdPartyCnpj",
  "isActive",
];

type AuditContext = { workspaceId: string; user: AuthUser; headers: Record<string, string | undefined> };

function recordEntityAudit(ctx: AuditContext, entityId: string, action: string, changes?: Record<string, unknown>) {
  recordAudit({
    workspaceId: ctx.workspaceId,
    entity: AUDIT_ENTITIES.ENTITY,
    entityId,
    action,
    actor: ctx.user,
    headers: ctx.headers,
    changes,
  });
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

  .post("/entities/", async ({ params: { slug }, body, user, set, headers }) => {
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
      recordEntityAudit({ workspaceId: ws.id, user, headers }, entity.id, AUDIT_ACTIONS.CREATE);
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

  .patch("/entities/:entity_id/", async ({ params: { slug, entity_id }, body, user, headers }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceAction(ws.id, user.id, EProjectAction.ENTITY_MANAGE);
    const current = await prisma.entity.findFirst({ where: { id: entity_id, workspaceId: ws.id, deletedAt: null } });
    if (!current) throw { status: 404, message: "Entidade não encontrada." };
    const data = readEntityData((body as any) ?? {});
    if (data.name === null) throw createFieldError("name", NAME_REQUIRED);
    await requireValidEntityData(ws.id, data, current);
    const updated = await prisma.entity.update({
      where: { id: entity_id },
      data: data as any,
      include: ENTITY_INCLUDE,
    });
    recordEntityAudit(
      { workspaceId: ws.id, user, headers },
      entity_id,
      AUDIT_ACTIONS.UPDATE,
      auditDiff(current, updated, AUDITED_FIELDS)
    );
    return entityDto(updated);
  })

  .delete("/entities/:entity_id/", async ({ params: { slug, entity_id }, user, set, headers }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceAction(ws.id, user.id, EProjectAction.ENTITY_MANAGE);
    // Filtra pelo espaço: sem isso, o id de uma entidade de outro espaço também era apagado.
    const removed = await prisma.entity.updateMany({
      where: { id: entity_id, workspaceId: ws.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (removed.count === 0) throw { status: 404, message: "Entidade não encontrada." };
    recordEntityAudit({ workspaceId: ws.id, user, headers }, entity_id, AUDIT_ACTIONS.DELETE);
    set.status = 204;
    return null;
  });
