// DB-coupled runtime permission checks (H3). Reads the live WorkflowRole /
// RoleStateVisibility / RoleStateTransition config. Kept separate from
// utils/permissions.ts (pure data + seed) so the seed scripts stay decoupled
// from the @db singleton.
import prisma from "@db";
import {
  DEFAULT_TRANSITIONS,
  EProjectAction,
  defaultRoleForLevel,
  roleCan,
  type EffectiveRole,
  type TransitionRule,
} from "@utils/permissions";
import {getProjectOrFail} from "@utils/workspace";

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
  const {project, member} = await getProjectOrFail(workspaceId, projectId, userId);
  const role = await resolveRole(workspaceId, member.role, (member as any).workflowRoleId);
  if (!roleCan(role, action)) {
    throw {status: 403, message: "Sua função não permite esta ação."};
  }
  return {project, member, role};
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
  const {project, member} = await getProjectOrFail(workspaceId, projectId, userId);
  const role = await resolveRole(workspaceId, member.role, (member as any).workflowRoleId);
  if (roleCan(role, allAction)) return {project, member, role};
  if (roleCan(role, ownAction) && ownerId && ownerId === userId) return {project, member, role};
  throw {status: 403, message: "Sua função não permite esta ação."};
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
