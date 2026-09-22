// Congelar e descongelar entidade ou usuário. Uma estratégia por tipo de
// alvo; o histórico (quem, quando, por quê) é comum e fica em freeze_events.
//
// Congelar a entidade desliga junto os contatos e as contas do portal que
// estavam ligados, e grava QUAIS foram desligados. Descongelar religa só esses:
// quem já estava inativo antes do congelamento continua inativo.

import prisma from "@db";
import type { Prisma } from "@prisma/client";
import { createFieldError } from "@utils/field-error";

type Tx = Prisma.TransactionClient;

export const FREEZE_SUBJECTS = { ENTITY: "entity", USER: "user" } as const;
export type FreezeSubjectKind = (typeof FREEZE_SUBJECTS)[keyof typeof FREEZE_SUBJECTS];

export const FREEZE_ACTIONS = { FREEZE: "freeze", UNFREEZE: "unfreeze" } as const;
export type FreezeAction = (typeof FREEZE_ACTIONS)[keyof typeof FREEZE_ACTIONS];

export type FreezeAffected = { contact_ids?: string[]; portal_account_ids?: string[] };

export type FreezeRequest = {
  kind: FreezeSubjectKind;
  workspaceId: string;
  subjectId: string;
  actorId: string;
  reason: string | null;
};

type FreezeStrategy = {
  /** Confere que o alvo existe no espaço e pode ser congelado por quem pediu. */
  require: (workspaceId: string, subjectId: string, actorId: string) => Promise<void>;
  /** Marca como congelado; devolve `null` se já estava congelado. */
  freeze: (tx: Tx, subjectId: string, reason: string) => Promise<FreezeAffected | null>;
  /** Tira o congelamento; devolve `false` se não estava congelado. */
  unfreeze: (tx: Tx, subjectId: string, affected: FreezeAffected) => Promise<boolean>;
};

export const MAX_REASON_LENGTH = 500;

const ALREADY_FROZEN = { status: 409, message: "Já está congelado." };
const NOT_FROZEN = { status: 409, message: "Não está congelado." };

async function requireEntity(workspaceId: string, entityId: string) {
  const entity = await prisma.entity.findFirst({
    where: { id: entityId, workspaceId, deletedAt: null },
    select: { id: true },
  });
  if (!entity) throw { status: 404, message: "Entidade não encontrada." };
}

async function freezeEntity(tx: Tx, entityId: string, reason: string): Promise<FreezeAffected | null> {
  const marked = await tx.entity.updateMany({
    where: { id: entityId, frozenAt: null },
    data: { frozenAt: new Date(), frozenReason: reason },
  });
  if (marked.count === 0) return null;
  const contacts = await tx.entityContact.findMany({
    where: { entityId, isActive: true, deletedAt: null },
    select: { id: true },
  });
  const accounts = await tx.portalAccount.findMany({
    where: { entityId, isActive: true, deletedAt: null },
    select: { id: true },
  });
  const contactIds = contacts.map((c) => c.id);
  const accountIds = accounts.map((a) => a.id);
  await tx.entityContact.updateMany({ where: { id: { in: contactIds } }, data: { isActive: false } });
  await tx.portalAccount.updateMany({ where: { id: { in: accountIds } }, data: { isActive: false } });
  return { contact_ids: contactIds, portal_account_ids: accountIds };
}

async function unfreezeEntity(tx: Tx, entityId: string, affected: FreezeAffected): Promise<boolean> {
  const cleared = await tx.entity.updateMany({
    where: { id: entityId, frozenAt: { not: null } },
    data: { frozenAt: null, frozenReason: null },
  });
  if (cleared.count === 0) return false;
  await tx.entityContact.updateMany({
    where: { id: { in: affected.contact_ids ?? [] }, entityId, deletedAt: null },
    data: { isActive: true },
  });
  await tx.portalAccount.updateMany({
    where: { id: { in: affected.portal_account_ids ?? [] }, entityId, deletedAt: null },
    data: { isActive: true },
  });
  return true;
}

async function requireFreezableUser(workspaceId: string, userId: string, actorId: string) {
  if (userId === actorId) throw createFieldError("member", "Você não pode congelar o próprio usuário.");
  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId, memberId: userId, deletedAt: null },
    select: { member: { select: { isInstanceAdmin: true } } },
  });
  if (!member) throw { status: 404, message: "Membro não encontrado." };
  if (member.member.isInstanceAdmin) {
    throw { status: 403, message: "Não é possível congelar um administrador da instância." };
  }
}

async function freezeUser(tx: Tx, userId: string, reason: string): Promise<FreezeAffected | null> {
  const now = new Date();
  // `tokenUpdatedAt` derruba na hora todas as sessões abertas (ver utils/session.ts).
  const marked = await tx.user.updateMany({
    where: { id: userId, frozenAt: null },
    data: { frozenAt: now, frozenReason: reason, isActive: false, tokenUpdatedAt: now },
  });
  return marked.count === 0 ? null : {};
}

async function unfreezeUser(tx: Tx, userId: string): Promise<boolean> {
  const cleared = await tx.user.updateMany({
    where: { id: userId, frozenAt: { not: null }, deletedAt: null },
    data: { frozenAt: null, frozenReason: null, isActive: true },
  });
  return cleared.count > 0;
}

const STRATEGIES: Record<FreezeSubjectKind, FreezeStrategy> = {
  entity: { require: requireEntity, freeze: freezeEntity, unfreeze: unfreezeEntity },
  user: { require: requireFreezableUser, freeze: freezeUser, unfreeze: (tx, id) => unfreezeUser(tx, id) },
};

export function readFreezeReason(value: unknown, required: boolean): string | null {
  const reason = String(value ?? "").trim();
  if (reason.length > MAX_REASON_LENGTH) {
    throw createFieldError("reason", `O motivo pode ter até ${MAX_REASON_LENGTH} caracteres.`);
  }
  if (!reason && required) throw createFieldError("reason", "Informe o motivo do congelamento.");
  return reason || null;
}

function recordFreezeEvent(tx: Tx, request: FreezeRequest, action: FreezeAction, affected: FreezeAffected) {
  return tx.freezeEvent.create({
    data: {
      workspaceId: request.workspaceId,
      subjectKind: request.kind,
      subjectId: request.subjectId,
      action,
      reason: request.reason,
      actorId: request.actorId,
      affected,
    },
  });
}

export async function applyFreeze(request: FreezeRequest): Promise<FreezeAffected> {
  const strategy = STRATEGIES[request.kind];
  await strategy.require(request.workspaceId, request.subjectId, request.actorId);
  return prisma.$transaction(async (tx) => {
    const affected = await strategy.freeze(tx, request.subjectId, request.reason ?? "");
    if (!affected) throw ALREADY_FROZEN;
    await recordFreezeEvent(tx, request, FREEZE_ACTIONS.FREEZE, affected);
    return affected;
  });
}

async function findLastFreezeAffected(tx: Tx, kind: FreezeSubjectKind, subjectId: string): Promise<FreezeAffected> {
  const last = await tx.freezeEvent.findFirst({
    where: { subjectKind: kind, subjectId, action: FREEZE_ACTIONS.FREEZE },
    orderBy: { createdAt: "desc" },
    select: { affected: true },
  });
  return (last?.affected ?? {}) as FreezeAffected;
}

export async function applyUnfreeze(request: FreezeRequest): Promise<FreezeAffected> {
  const strategy = STRATEGIES[request.kind];
  await strategy.require(request.workspaceId, request.subjectId, request.actorId);
  return prisma.$transaction(async (tx) => {
    const affected = await findLastFreezeAffected(tx, request.kind, request.subjectId);
    if (!(await strategy.unfreeze(tx, request.subjectId, affected))) throw NOT_FROZEN;
    await recordFreezeEvent(tx, request, FREEZE_ACTIONS.UNFREEZE, affected);
    return affected;
  });
}

/** Histórico do alvo, do mais novo para o mais antigo, com o nome de quem fez. */
export async function listFreezeEvents(workspaceId: string, kind: FreezeSubjectKind, subjectId: string) {
  const events = await prisma.freezeEvent.findMany({
    where: { workspaceId, subjectKind: kind, subjectId },
    orderBy: { createdAt: "desc" },
  });
  const actorIds = [...new Set(events.map((e) => e.actorId).filter((id): id is string => Boolean(id)))];
  const actors = await prisma.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, displayName: true },
  });
  const names = new Map(actors.map((a) => [a.id, a.displayName]));
  return events.map((e) => ({
    id: e.id,
    action: e.action,
    reason: e.reason,
    actor_id: e.actorId,
    actor_name: e.actorId ? (names.get(e.actorId) ?? null) : null,
    created_at: e.createdAt.toISOString(),
  }));
}
