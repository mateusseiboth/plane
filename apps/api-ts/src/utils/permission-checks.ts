// DB-coupled runtime permission checks (H3). Reads the live WorkflowRole /
// RoleStateVisibility / RoleStateTransition config. Kept separate from
// utils/permissions.ts (pure data + seed) so the seed scripts stay decoupled
// from the @db singleton.
import prisma from "@db";
import {DEFAULT_ROLES, EProjectAction, roleCan, type EffectiveRole} from "@utils/permissions";

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
  const def = [...DEFAULT_ROLES].reverse().find((d) => roleIntOrLevel >= d.level) ?? DEFAULT_ROLES[0];
  return {id: null, key: def.key, level: def.level, permissions: def.permissions};
}

/** State ids a role may see within a project (null = no restriction / sees all). */
export async function visibleStateIds(role: EffectiveRole, projectId: string): Promise<string[] | null> {
  if (!role.id) return null;
  if (roleCan(role, EProjectAction.STATE_MOVE_UNRESTRICTED)) return null;
  const rules = await prisma.roleStateVisibility.findMany({where: {roleId: role.id, canView: true}});
  if (!rules.length) return null; // no rows → sees everything
  const states = await prisma.state.findMany({where: {projectId, deletedAt: null}, select: {id: true, name: true, group: true}});
  const allowed = states.filter((s) =>
    rules.some((r) => r.group === s.group && (r.stateName === null || r.stateName === s.name)),
  );
  return allowed.map((s) => s.id);
}

/** Whether a role may move an issue between two states. */
export async function canTransition(
  role: EffectiveRole,
  from: {group: string; name: string},
  to: {group: string; name: string},
): Promise<boolean> {
  if (roleCan(role, EProjectAction.STATE_MOVE_UNRESTRICTED)) return true;
  if (from.name === to.name) return true; // no-op move
  if (!role.id) return true; // unseeded role → permissive (legacy behaviour)
  const rows = await prisma.roleStateTransition.findMany({where: {roleId: role.id, allowed: true}});
  return rows.some(
    (r) =>
      r.fromGroup === from.group &&
      (r.fromStateName === null || r.fromStateName === from.name) &&
      r.toGroup === to.group &&
      (r.toStateName === null || r.toStateName === to.name),
  );
}
