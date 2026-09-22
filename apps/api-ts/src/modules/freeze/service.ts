// Congelar e descongelar. Uma estratégia por tipo de alvo; o histórico (quem,
// quando, por quê) é comum e fica em freeze_events.
//
//  - entity:  a entidade do espaço. Desliga junto os contatos e as contas do
//             portal que estavam ligados e grava QUAIS foram; descongelar religa
//             só esses (quem já estava inativo antes continua inativo).
//  - member:  o vínculo da pessoa com UM espaço. A conta segue entrando e os
//             outros espaços não mudam.
//  - account: a conta inteira (admin da instância). Bloqueia o login e derruba
//             as sessões; não pertence a espaço nenhum.

import prisma from "@db";
import type { Prisma } from "@prisma/client";
import { createFieldError } from "@utils/field-error";

type Tx = Prisma.TransactionClient;

export const FREEZE_SUBJECTS = { ENTITY: "entity", MEMBER: "member", ACCOUNT: "account" } as const;
export type FreezeSubjectKind = (typeof FREEZE_SUBJECTS)[keyof typeof FREEZE_SUBJECTS];

export const FREEZE_ACTIONS = { FREEZE: "freeze", UNFREEZE: "unfreeze" } as const;
export type FreezeAction = (typeof FREEZE_ACTIONS)[keyof typeof FREEZE_ACTIONS];

export type FreezeAffected = { contact_ids?: string[]; portal_account_ids?: string[] };

export type FreezeRequest = {
  kind: FreezeSubjectKind;
  /** Nulo no congelamento da conta. */
  workspaceId: string | null;
  subjectId: string;
  actorId: string;
  reason: string | null;
};

type FreezeStrategy = {
  /** Confere que o alvo existe e pode ser congelado por quem pediu. */
  require: (request: FreezeRequest) => Promise<void>;
  /** Marca como congelado; devolve `null` se já estava congelado. */
  freeze: (tx: Tx, request: FreezeRequest) => Promise<FreezeAffected | null>;
  /** Tira o congelamento; devolve `false` se não estava congelado. */
  unfreeze: (tx: Tx, request: FreezeRequest, affected: FreezeAffected) => Promise<boolean>;
};

export const MAX_REASON_LENGTH = 500;

const ALREADY_FROZEN = { status: 409, message: "Já está congelado." };
const NOT_FROZEN = { status: 409, message: "Não está congelado." };

// ── Entidade ──────────────────────────────────────────────────────────────────

async function requireEntity({ workspaceId, subjectId }: FreezeRequest) {
  const entity = await prisma.entity.findFirst({
    where: { id: subjectId, workspaceId: workspaceId ?? undefined, deletedAt: null },
    select: { id: true },
  });
  if (!entity) throw { status: 404, message: "Entidade não encontrada." };
}

async function freezeEntity(tx: Tx, { subjectId: entityId, reason }: FreezeRequest): Promise<FreezeAffected | null> {
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

async function unfreezeEntity(tx: Tx, { subjectId: entityId }: FreezeRequest, affected: FreezeAffected) {
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

// ── Vínculo com o espaço ──────────────────────────────────────────────────────

function requireNotSelf({ subjectId, actorId }: FreezeRequest) {
  if (subjectId === actorId) throw createFieldError("member", "Você não pode congelar o próprio usuário.");
}

async function requireMember(request: FreezeRequest) {
  requireNotSelf(request);
  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId: request.workspaceId ?? undefined, memberId: request.subjectId, deletedAt: null },
    select: { id: true },
  });
  if (!member) throw { status: 404, message: "Membro não encontrado." };
}

async function freezeMember(tx: Tx, { workspaceId, subjectId, reason }: FreezeRequest) {
  const marked = await tx.workspaceMember.updateMany({
    where: { workspaceId: workspaceId ?? undefined, memberId: subjectId, deletedAt: null, frozenAt: null },
    data: { frozenAt: new Date(), frozenReason: reason, isActive: false },
  });
  return marked.count === 0 ? null : {};
}

async function unfreezeMember(tx: Tx, { workspaceId, subjectId }: FreezeRequest) {
  const cleared = await tx.workspaceMember.updateMany({
    where: { workspaceId: workspaceId ?? undefined, memberId: subjectId, deletedAt: null, frozenAt: { not: null } },
    data: { frozenAt: null, frozenReason: null, isActive: true },
  });
  return cleared.count > 0;
}

// ── Conta inteira ─────────────────────────────────────────────────────────────

async function requireAccount(request: FreezeRequest) {
  requireNotSelf(request);
  const user = await prisma.user.findFirst({
    where: { id: request.subjectId, deletedAt: null },
    select: { id: true },
  });
  if (!user) throw { status: 404, message: "Usuário não encontrado." };
}

async function freezeAccount(tx: Tx, { subjectId, reason }: FreezeRequest) {
  const now = new Date();
  // `tokenUpdatedAt` derruba na hora todas as sessões abertas (ver utils/session.ts).
  const marked = await tx.user.updateMany({
    where: { id: subjectId, frozenAt: null },
    data: { frozenAt: now, frozenReason: reason, isActive: false, tokenUpdatedAt: now },
  });
  return marked.count === 0 ? null : {};
}

async function unfreezeAccount(tx: Tx, { subjectId }: FreezeRequest) {
  const cleared = await tx.user.updateMany({
    where: { id: subjectId, frozenAt: { not: null }, deletedAt: null },
    data: { frozenAt: null, frozenReason: null, isActive: true },
  });
  return cleared.count > 0;
}

const STRATEGIES: Record<FreezeSubjectKind, FreezeStrategy> = {
  entity: { require: requireEntity, freeze: freezeEntity, unfreeze: unfreezeEntity },
  member: { require: requireMember, freeze: freezeMember, unfreeze: unfreezeMember },
  account: { require: requireAccount, freeze: freezeAccount, unfreeze: unfreezeAccount },
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
  await strategy.require(request);
  return prisma.$transaction(async (tx) => {
    const affected = await strategy.freeze(tx, request);
    if (!affected) throw ALREADY_FROZEN;
    await recordFreezeEvent(tx, request, FREEZE_ACTIONS.FREEZE, affected);
    return affected;
  });
}

async function findLastFreezeAffected(tx: Tx, request: FreezeRequest): Promise<FreezeAffected> {
  const last = await tx.freezeEvent.findFirst({
    where: {
      workspaceId: request.workspaceId,
      subjectKind: request.kind,
      subjectId: request.subjectId,
      action: FREEZE_ACTIONS.FREEZE,
    },
    orderBy: { createdAt: "desc" },
    select: { affected: true },
  });
  return (last?.affected ?? {}) as FreezeAffected;
}

export async function applyUnfreeze(request: FreezeRequest): Promise<FreezeAffected> {
  const strategy = STRATEGIES[request.kind];
  await strategy.require(request);
  return prisma.$transaction(async (tx) => {
    const affected = await findLastFreezeAffected(tx, request);
    if (!(await strategy.unfreeze(tx, request, affected))) throw NOT_FROZEN;
    await recordFreezeEvent(tx, request, FREEZE_ACTIONS.UNFREEZE, affected);
    return affected;
  });
}

/** Histórico do alvo, do mais novo para o mais antigo, com o nome de quem fez. */
export async function listFreezeEvents(workspaceId: string | null, kind: FreezeSubjectKind, subjectId: string) {
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
