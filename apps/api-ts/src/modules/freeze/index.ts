// Rotas de congelamento: entidade e membro (usuário). Só administrador do
// espaço congela ou descongela; qualquer membro consulta o histórico.

import { Elysia } from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { findEntityDto } from "@modules/entity/service";
import {
  FREEZE_SUBJECTS,
  applyFreeze,
  applyUnfreeze,
  listFreezeEvents,
  readFreezeReason,
  type FreezeSubjectKind,
} from "@modules/freeze/service";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, recordAudit } from "@utils/audit";
import { getWorkspaceOrFail, requireWorkspaceAdmin, requireWorkspaceMember } from "@utils/workspace";

type Actor = { id: string; email: string };

const FROZEN_USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  isActive: true,
  frozenAt: true,
  frozenReason: true,
} as const;

function frozenUserDto(user: {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  frozenAt: Date | null;
  frozenReason: string | null;
}) {
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

async function findFrozenUserDto(userId: string) {
  return frozenUserDto(await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: FROZEN_USER_SELECT }));
}

/**
 * Membros congelados do espaço. A lista comum de membros esconde quem está
 * inativo (para não aparecer em seletor de responsável); esta é a que a tela de
 * membros usa para mostrar os congelados e oferecer o descongelamento.
 */
async function listFrozenMembers(slug: string, userId: string) {
  const ws = await getWorkspaceOrFail(slug);
  await requireWorkspaceMember(ws.id, userId);
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: ws.id, deletedAt: null, member: { frozenAt: { not: null }, deletedAt: null } },
    select: { member: { select: FROZEN_USER_SELECT } },
    orderBy: { member: { displayName: "asc" } },
  });
  return members.map((m) => frozenUserDto(m.member));
}

// O que cada tipo de alvo devolve e onde entra na trilha LGPD.
const SUBJECT_VIEWS: Record<
  FreezeSubjectKind,
  { auditEntity: string; load: (ws: string, id: string) => Promise<unknown> }
> = {
  entity: { auditEntity: AUDIT_ENTITIES.ENTITY, load: (ws, id) => findEntityDto(ws, id) },
  user: { auditEntity: AUDIT_ENTITIES.USER, load: (_ws, id) => findFrozenUserDto(id) },
};

const OPERATIONS = {
  freeze: { apply: applyFreeze, auditAction: AUDIT_ACTIONS.FREEZE, reasonRequired: true },
  unfreeze: { apply: applyUnfreeze, auditAction: AUDIT_ACTIONS.UNFREEZE, reasonRequired: false },
} as const;

async function runFreezeOperation(
  operation: keyof typeof OPERATIONS,
  kind: FreezeSubjectKind,
  slug: string,
  subjectId: string,
  body: any,
  actor: Actor,
  headers: Record<string, string | undefined>
) {
  const ws = await getWorkspaceOrFail(slug);
  await requireWorkspaceAdmin(ws.id, actor.id);
  const op = OPERATIONS[operation];
  const reason = readFreezeReason(body?.reason, op.reasonRequired);
  const affected = await op.apply({ kind, workspaceId: ws.id, subjectId, actorId: actor.id, reason });
  const view = SUBJECT_VIEWS[kind];
  recordAudit({
    workspaceId: ws.id,
    entity: view.auditEntity,
    entityId: subjectId,
    action: op.auditAction,
    actor,
    headers,
    metadata: {
      contatos_afetados: affected.contact_ids?.length ?? 0,
      contas_do_portal_afetadas: affected.portal_account_ids?.length ?? 0,
    },
  });
  return view.load(ws.id, subjectId);
}

async function readHistory(kind: FreezeSubjectKind, slug: string, subjectId: string, userId: string) {
  const ws = await getWorkspaceOrFail(slug);
  await requireWorkspaceMember(ws.id, userId);
  return listFreezeEvents(ws.id, kind, subjectId);
}

const { ENTITY, USER } = FREEZE_SUBJECTS;

export const freezeModule = new Elysia({ prefix: "/workspaces/:slug" })
  .use(authPlugin)

  .post("/entities/:entity_id/freeze/", ({ params, body, user, headers }) =>
    runFreezeOperation("freeze", ENTITY, params.slug, params.entity_id, body, user, headers)
  )
  .post("/entities/:entity_id/unfreeze/", ({ params, body, user, headers }) =>
    runFreezeOperation("unfreeze", ENTITY, params.slug, params.entity_id, body, user, headers)
  )
  .get("/entities/:entity_id/freeze-events/", ({ params, user }) =>
    readHistory(ENTITY, params.slug, params.entity_id, user.id)
  )

  .post("/members/:pk/freeze/", ({ params, body, user, headers }) =>
    runFreezeOperation("freeze", USER, params.slug, params.pk, body, user, headers)
  )
  .post("/members/:pk/unfreeze/", ({ params, body, user, headers }) =>
    runFreezeOperation("unfreeze", USER, params.slug, params.pk, body, user, headers)
  )
  .get("/members/:pk/freeze-events/", ({ params, user }) => readHistory(USER, params.slug, params.pk, user.id))
  .get("/frozen-members/", ({ params, user }) => listFrozenMembers(params.slug, user.id));
