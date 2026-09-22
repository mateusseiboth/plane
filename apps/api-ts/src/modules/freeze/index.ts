// Rotas de congelamento.
//  - Entidade do espaço: ação `entity.freeze`.
//  - Membro do espaço (só o vínculo com este espaço): ação `workspace.members`.
//  - Conta inteira: só admin da instância, fora de qualquer espaço.
// Qualquer membro do espaço consulta o histórico da entidade e do vínculo.

import { Elysia } from "elysia";
import { authPlugin, type AuthUser } from "@middleware/auth";
import prisma from "@db";
import { findEntityDto } from "@modules/entity/service";
import {
  FREEZE_SUBJECTS,
  applyFreeze,
  applyUnfreeze,
  listFreezeEvents,
  readFreezeReason,
  type FreezeAffected,
  type FreezeSubjectKind,
} from "@modules/freeze/service";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, recordAudit } from "@utils/audit";
import { EProjectAction, requireWorkspaceAction } from "@utils/permission-checks";
import { getWorkspaceOrFail, requireWorkspaceMember } from "@utils/workspace";

type Headers = Record<string, string | undefined>;
type WorkspaceKind = Exclude<FreezeSubjectKind, "account">;

const OPERATIONS = {
  freeze: { apply: applyFreeze, auditAction: AUDIT_ACTIONS.FREEZE, reasonRequired: true },
  unfreeze: { apply: applyUnfreeze, auditAction: AUDIT_ACTIONS.UNFREEZE, reasonRequired: false },
} as const;

type Operation = keyof typeof OPERATIONS;

function buildAffectedMetadata(affected: FreezeAffected) {
  return {
    contatos_afetados: affected.contact_ids?.length ?? 0,
    contas_do_portal_afetadas: affected.portal_account_ids?.length ?? 0,
  };
}

// ── Pessoa ────────────────────────────────────────────────────────────────────

async function findMemberFreezeDto(workspaceId: string, userId: string) {
  const member = await prisma.workspaceMember.findFirstOrThrow({
    where: { workspaceId, memberId: userId, deletedAt: null },
    select: {
      isActive: true,
      frozenAt: true,
      frozenReason: true,
      member: { select: { id: true, email: true, displayName: true } },
    },
  });
  return {
    id: member.member.id,
    email: member.member.email,
    display_name: member.member.displayName,
    is_active: member.isActive,
    is_frozen: Boolean(member.frozenAt),
    frozen_at: member.frozenAt?.toISOString() ?? null,
    frozen_reason: member.frozenReason,
  };
}

async function findAccountFreezeDto(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, displayName: true, isActive: true, frozenAt: true, frozenReason: true },
  });
  return {
    id: user.id,
    email: user.email,
    display_name: user.displayName,
    is_active: user.isActive,
    is_frozen: Boolean(user.frozenAt),
    frozen_at: user.frozenAt?.toISOString() ?? null,
    frozen_reason: user.frozenReason,
  };
}

/**
 * Membros congelados neste espaço. A lista comum de membros esconde o vínculo
 * inativo (para não aparecer em seletor de responsável); esta é a que a tela
 * de membros usa para mostrar o motivo e oferecer o descongelamento.
 */
async function listFrozenMembers(slug: string, userId: string) {
  const ws = await getWorkspaceOrFail(slug);
  await requireWorkspaceMember(ws.id, userId);
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: ws.id, deletedAt: null, frozenAt: { not: null } },
    select: { memberId: true },
    orderBy: { member: { displayName: "asc" } },
  });
  return Promise.all(members.map((m) => findMemberFreezeDto(ws.id, m.memberId)));
}

// ── Espaço (entidade e vínculo) ───────────────────────────────────────────────

// Ação exigida, entidade da trilha e o que a rota devolve, por tipo de alvo.
const WORKSPACE_SUBJECTS: Record<
  WorkspaceKind,
  { action: EProjectAction; auditEntity: string; load: (workspaceId: string, id: string) => Promise<unknown> }
> = {
  entity: { action: EProjectAction.ENTITY_FREEZE, auditEntity: AUDIT_ENTITIES.ENTITY, load: findEntityDto },
  member: {
    action: EProjectAction.WORKSPACE_MEMBERS,
    auditEntity: AUDIT_ENTITIES.MEMBER,
    load: findMemberFreezeDto,
  },
};

async function runWorkspaceOperation(
  operation: Operation,
  kind: WorkspaceKind,
  params: { slug: string; id: string },
  body: any,
  actor: AuthUser,
  headers: Headers
) {
  const ws = await getWorkspaceOrFail(params.slug);
  const subject = WORKSPACE_SUBJECTS[kind];
  await requireWorkspaceAction(ws.id, actor.id, subject.action);
  const op = OPERATIONS[operation];
  const reason = readFreezeReason(body?.reason, op.reasonRequired);
  const affected = await op.apply({ kind, workspaceId: ws.id, subjectId: params.id, actorId: actor.id, reason });
  recordAudit({
    workspaceId: ws.id,
    entity: subject.auditEntity,
    entityId: params.id,
    action: op.auditAction,
    actor,
    headers,
    metadata: buildAffectedMetadata(affected),
  });
  return subject.load(ws.id, params.id);
}

async function readWorkspaceHistory(kind: WorkspaceKind, slug: string, subjectId: string, userId: string) {
  const ws = await getWorkspaceOrFail(slug);
  await requireWorkspaceMember(ws.id, userId);
  return listFreezeEvents(ws.id, kind, subjectId);
}

// ── Conta (instância) ─────────────────────────────────────────────────────────

function requireInstanceAdmin(user: AuthUser) {
  if (!user.isInstanceAdmin) throw { status: 403, message: "Só o administrador da instância congela a conta." };
}

/** A trilha é por espaço: o congelamento da conta entra na de cada espaço da pessoa. */
async function auditAccountOperation(userId: string, action: string, actor: AuthUser, headers: Headers) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { memberId: userId, deletedAt: null },
    select: { workspaceId: true },
  });
  for (const { workspaceId } of memberships) {
    recordAudit({
      workspaceId,
      entity: AUDIT_ENTITIES.USER,
      entityId: userId,
      action,
      actor,
      headers,
      metadata: { conta: true },
    });
  }
}

async function runAccountOperation(operation: Operation, userId: string, body: any, actor: AuthUser, headers: Headers) {
  requireInstanceAdmin(actor);
  const op = OPERATIONS[operation];
  const reason = readFreezeReason(body?.reason, op.reasonRequired);
  await op.apply({ kind: FREEZE_SUBJECTS.ACCOUNT, workspaceId: null, subjectId: userId, actorId: actor.id, reason });
  await auditAccountOperation(userId, op.auditAction, actor, headers);
  return findAccountFreezeDto(userId);
}

const { ENTITY, MEMBER, ACCOUNT } = FREEZE_SUBJECTS;

const workspaceFreezeRoutes = new Elysia({ prefix: "/workspaces/:slug" })
  .use(authPlugin)
  .post("/entities/:entity_id/freeze/", ({ params, body, user, headers }) =>
    runWorkspaceOperation("freeze", ENTITY, { slug: params.slug, id: params.entity_id }, body, user, headers)
  )
  .post("/entities/:entity_id/unfreeze/", ({ params, body, user, headers }) =>
    runWorkspaceOperation("unfreeze", ENTITY, { slug: params.slug, id: params.entity_id }, body, user, headers)
  )
  .get("/entities/:entity_id/freeze-events/", ({ params, user }) =>
    readWorkspaceHistory(ENTITY, params.slug, params.entity_id, user.id)
  )
  .post("/members/:pk/freeze/", ({ params, body, user, headers }) =>
    runWorkspaceOperation("freeze", MEMBER, { slug: params.slug, id: params.pk }, body, user, headers)
  )
  .post("/members/:pk/unfreeze/", ({ params, body, user, headers }) =>
    runWorkspaceOperation("unfreeze", MEMBER, { slug: params.slug, id: params.pk }, body, user, headers)
  )
  .get("/members/:pk/freeze-events/", ({ params, user }) =>
    readWorkspaceHistory(MEMBER, params.slug, params.pk, user.id)
  )
  .get("/frozen-members/", ({ params, user }) => listFrozenMembers(params.slug, user.id));

const accountFreezeRoutes = new Elysia({ prefix: "/instances/users/:user_id" })
  .use(authPlugin)
  .post("/freeze/", ({ params, body, user, headers }) =>
    runAccountOperation("freeze", params.user_id, body, user, headers)
  )
  .post("/unfreeze/", ({ params, body, user, headers }) =>
    runAccountOperation("unfreeze", params.user_id, body, user, headers)
  )
  .get("/freeze-events/", ({ params, user }) => {
    requireInstanceAdmin(user);
    return listFreezeEvents(null, ACCOUNT, params.user_id);
  });

export const freezeModule = new Elysia().use(workspaceFreezeRoutes).use(accountFreezeRoutes);
