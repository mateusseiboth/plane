// Checagens de permissão em runtime (modelo v2). Lê a configuração viva:
// WorkflowRole (função), RoleStateTransition (etapas) e as exceções por pessoa
// de workspace_members. TODA pergunta "esta pessoa pode X?" passa por aqui; o
// catálogo de ações mora em utils/permissions.ts. Ver .claude/permissoes-v2.md.
import prisma from "@db";
import {
  DEFAULT_TRANSITIONS,
  EProjectAction,
  applyMemberOverrides,
  defaultRoleForLevel,
  roleCan,
  type EffectiveRole,
  type TransitionRule,
} from "@utils/permissions";
import {getProjectOrFail, requireWorkspaceMember} from "@utils/workspace";

export {roleCan, EProjectAction};
export type {EffectiveRole};

/**
 * Resolve the effective configurable role for a member. Prefers the explicit
 * workflowRole, then a seeded system role matching the legacy `role` Int level,
 * and finally an in-memory default so enforcement works before roles are seeded.
 */
export async function resolveRole(workspaceId: string, roleIntOrLevel: number, workflowRoleId?: string | null): Promise<EffectiveRole> {
  if (workflowRoleId) {
    const r = await prisma.workflowRole.findFirst({where: {id: workflowRoleId, deletedAt: null}});
    if (r) return {id: r.id, key: r.key, level: r.level, permissions: (r.permissions as string[]) ?? []};
  }
  const byLevel = await prisma.workflowRole.findFirst({where: {workspaceId, level: roleIntOrLevel, deletedAt: null}});
  if (byLevel) return {id: byLevel.id, key: byLevel.key, level: byLevel.level, permissions: (byLevel.permissions as string[]) ?? []};
  const def = defaultRoleForLevel(roleIntOrLevel);
  return {id: null, key: def.key, level: def.level, permissions: def.permissions};
}

type MemberLike = {memberId: string; role: number; workflowRoleId?: string | null};

const DENIED = {status: 403, message: "Sua função não permite esta ação."};

const denyAction = (): never => {
  throw DENIED;
};

/** Exceções por pessoa: moram na associação ao ESPAÇO e valem em todos os sistemas dele. */
async function readOverrides(workspaceId: string, memberId: string): Promise<{granted: unknown; revoked: unknown}> {
  const wm = await prisma.workspaceMember.findFirst({
    where: {workspaceId, memberId, isActive: true, deletedAt: null},
    select: {grantedActions: true, revokedActions: true},
  });
  return {granted: wm?.grantedActions ?? [], revoked: wm?.revokedActions ?? []};
}

/**
 * Função efetiva de uma associação (ao espaço ou ao sistema): a função
 * configurável, com as concessões e negações da pessoa aplicadas por cima.
 */
export async function resolveMemberRole(workspaceId: string, member: MemberLike): Promise<EffectiveRole> {
  const role = await resolveRole(workspaceId, member.role, member.workflowRoleId);
  const overrides = await readOverrides(workspaceId, member.memberId);
  return {...role, permissions: applyMemberOverrides(role.permissions, overrides)};
}

export async function resolveProjectMember(workspaceId: string, projectId: string, userId: string) {
  const {project, member} = await getProjectOrFail(workspaceId, projectId, userId);
  const role = await resolveMemberRole(workspaceId, member as MemberLike);
  return {project, member, role};
}

/**
 * Membership + action guard for every project-scoped mutation.
 *
 * The backend is the source of truth: UI gates are a convenience, so any route
 * that changes project data must go through here (or an equivalent explicit
 * check). Throws 403 when the caller is not a project member or when the
 * effective (configurable) role lacks `action`.
 */
export async function requireProjectAction(
  workspaceId: string,
  projectId: string,
  userId: string,
  action: EProjectAction,
): Promise<{project: any; member: any; role: EffectiveRole}> {
  const resolved = await resolveProjectMember(workspaceId, projectId, userId);
  if (!roleCan(resolved.role, action)) denyAction();
  return resolved;
}

/**
 * Variante de `requireProjectAction` para quando mais de uma permissão serve.
 *
 * "Quem pode abrir chamado" não é uma permissão só neste fork: Atendimento abre
 * pela triagem (`intake.create`) e os demais papéis abrem o item direto
 * (`issue.create`). Exigir uma delas sozinha deixaria de fora justamente metade
 * de quem escreve chamado.
 */
export async function requireProjectAnyAction(
  workspaceId: string,
  projectId: string,
  userId: string,
  actions: EProjectAction[],
): Promise<{project: any; member: any; role: EffectiveRole}> {
  const resolved = await resolveProjectMember(workspaceId, projectId, userId);
  if (!actions.some((action) => roleCan(resolved.role, action))) denyAction();
  return resolved;
}

/**
 * Guard for mutating a single record the caller may only own (comments,
 * attachments, work items). Passes when the role holds `allAction`, or holds
 * `ownAction` and is the record's author.
 */
export async function requireOwnOrAll(
  workspaceId: string,
  projectId: string,
  userId: string,
  ownerId: string | null | undefined,
  ownAction: EProjectAction,
  allAction: EProjectAction,
): Promise<{project: any; member: any; role: EffectiveRole}> {
  const resolved = await resolveProjectMember(workspaceId, projectId, userId);
  if (roleCan(resolved.role, allAction)) return resolved;
  if (roleCan(resolved.role, ownAction) && ownerId && ownerId === userId) return resolved;
  return denyAction();
}

/** Guarda de uma ação sobre uma função já resolvida (ex.: prioridade dentro do PATCH). */
export function requireRoleAction(role: EffectiveRole, action: EProjectAction): void {
  if (!roleCan(role, action)) denyAction();
}

/** Whether a role may move an issue between two states. */
export async function canTransition(
  role: EffectiveRole,
  from: {group: string; name: string},
  to: {group: string; name: string},
): Promise<boolean> {
  if (roleCan(role, EProjectAction.STATE_MOVE_UNRESTRICTED)) return true;
  if (from.name === to.name) return true; // no-op move

  // Espaço de trabalho ainda sem as funções gravadas caía num `return true`:
  // NENHUMA transição era barrada ali. A regra vale igual, só que lida da
  // matriz padrão do código em vez do banco.
  const regras: TransitionRule[] = role.id
    ? (await prisma.roleStateTransition.findMany({where: {roleId: role.id, allowed: true}})).map((r) => ({
        fromGroup: r.fromGroup,
        fromStateName: r.fromStateName,
        toGroup: r.toGroup,
        toStateName: r.toStateName,
      }))
    : (DEFAULT_TRANSITIONS[role.key] ?? []);

  return regras.some(
    (r) =>
      r.fromGroup === from.group &&
      (!r.fromStateName || r.fromStateName === from.name) &&
      r.toGroup === to.group &&
      (!r.toStateName || r.toStateName === to.name),
  );
}

/**
 * Função efetiva da pessoa no ESPAÇO DE TRABALHO, ou `null` quando ela não é
 * membro ativo dele.
 */
export async function resolveWorkspaceRole(workspaceId: string, userId: string): Promise<EffectiveRole | null> {
  const member = await prisma.workspaceMember.findFirst({
    where: {workspaceId, memberId: userId, isActive: true, deletedAt: null},
  });
  if (!member) return null;
  const role = await resolveRole(workspaceId, member.role, member.workflowRoleId);
  const permissions = applyMemberOverrides(role.permissions, {granted: member.grantedActions, revoked: member.revokedActions});
  return {...role, permissions};
}

/**
 * Guarda de ação para rotas do ESPAÇO DE TRABALHO, sem projeto no caminho.
 *
 * `requireProjectAction` não serve para elas, e cair no nível (>= 15) seria pior
 * ainda: neste fork Atendimento é 6, Qualidade 8 e TI 12. O corte por nível
 * barraria justamente quem opera. O que separa é a permissão.
 */
export async function requireWorkspaceAction(
  workspaceId: string,
  userId: string,
  action: EProjectAction,
): Promise<EffectiveRole> {
  await requireWorkspaceMember(workspaceId, userId);
  const role = await resolveWorkspaceRole(workspaceId, userId);
  if (!role || !roleCan(role, action)) return denyAction();
  return role;
}

/** Versão que não lança: para decidir o que MOSTRAR (ex.: páginas de outros). */
export async function hasWorkspaceAction(workspaceId: string, userId: string, action: EProjectAction): Promise<boolean> {
  const role = await resolveWorkspaceRole(workspaceId, userId);
  return !!role && roleCan(role, action);
}

/** O que a pessoa pode no espaço: função, permissões efetivas e as exceções dela. */
export async function listMemberActions(workspaceId: string, userId: string) {
  const member = await requireWorkspaceMember(workspaceId, userId);
  const role = await resolveRole(workspaceId, member.role, member.workflowRoleId);
  const overrides = {granted: member.grantedActions, revoked: member.revokedActions};
  return {
    role,
    permissions: applyMemberOverrides(role.permissions, overrides),
    granted: applyMemberOverrides([], {granted: overrides.granted, revoked: []}),
    revoked: applyMemberOverrides([], {granted: overrides.revoked, revoked: []}),
  };
}
