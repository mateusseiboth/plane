/**
 * Hook for granular project role permission checks.
 * Use this instead of allowPermissions when you need fine-grained control
 * beyond the basic ADMIN/MEMBER/GUEST hierarchy.
 */
import { useParams } from "next/navigation";
import { EUserProjectRoles } from "@plane/types";
import {
  ROLES_CAN_DELETE_ISSUES,
  ROLES_CAN_DELETE_OTHERS_COMMENTS,
  ROLES_CAN_MANAGE_MEMBERS,
  ROLES_CAN_MANAGE_STATES,
  ROLES_CAN_CREATE_INTAKE,
  ROLES_CAN_EDIT,
  ROLES_CAN_COMMENT,
  canTransitionState,
} from "@plane/constants";
import { useUserPermissions } from "@/hooks/store/user";
import { EUserPermissionsLevel } from "@plane/constants";

export function useProjectRolePermissions(projectId?: string) {
  const { workspaceSlug, projectId: routerProjectId } = useParams();
  const { allowPermissions, getProjectRoleByWorkspaceSlugAndProjectId } = useUserPermissions();

  const resolvedProjectId = projectId ?? routerProjectId?.toString();
  const slug = workspaceSlug?.toString() ?? "";

  const role: EUserProjectRoles | undefined =
    slug && resolvedProjectId
      ? (getProjectRoleByWorkspaceSlugAndProjectId(slug, resolvedProjectId) as EUserProjectRoles | undefined)
      : undefined;

  const check = (allowed: EUserProjectRoles[]): boolean => {
    if (!role) return false;
    return allowed.includes(role);
  };

  return {
    role,

    // Basic actions
    canCreateIssue: check(ROLES_CAN_EDIT),
    canEditIssue: check(ROLES_CAN_EDIT),
    canDeleteIssue: check(ROLES_CAN_DELETE_ISSUES),
    canComment: check(ROLES_CAN_COMMENT),
    canDeleteOthersComment: check(ROLES_CAN_DELETE_OTHERS_COMMENTS),
    canManageMembers: check(ROLES_CAN_MANAGE_MEMBERS),
    canManageStates: check(ROLES_CAN_MANAGE_STATES),
    canCreateIntake: check(ROLES_CAN_CREATE_INTAKE),

    // State transition check
    canMoveToState: (fromGroup: string, toGroup: string): boolean => {
      if (!role) return false;
      return canTransitionState(role, fromGroup, toGroup);
    },

    // Role checks
    isAtendimento: role === EUserProjectRoles.ATENDIMENTO,
    isQualidade: role === EUserProjectRoles.QUALIDADE,
    isTI: role === EUserProjectRoles.TI,
    isGestorProjeto: role === EUserProjectRoles.GESTOR_PROJETO,
    isMember: role === EUserProjectRoles.MEMBER,
    isAdmin: role === EUserProjectRoles.ADMIN,
  };
}
