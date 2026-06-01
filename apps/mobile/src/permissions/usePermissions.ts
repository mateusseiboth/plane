import { useMemo } from "react";

import { useAuth } from "@/auth/AuthContext";
import { Capability, can, roleLabel } from "./roles";

/**
 * Resolve capabilities for the current user. Pass a `projectId` to evaluate
 * against the granular project (SAC sector) role; otherwise the workspace role
 * is used. Admins always win.
 */
export function usePermissions(projectId?: string) {
  const { workspaceRole, projectRoles } = useAuth();

  const role = useMemo(() => {
    const project = projectId ? projectRoles[projectId] : undefined;
    // Effective role is the higher of workspace and project role.
    return Math.max(workspaceRole ?? 0, project ?? 0) || (workspaceRole ?? null);
  }, [workspaceRole, projectRoles, projectId]);

  return useMemo(
    () => ({
      role,
      label: roleLabel(role),
      can: (capability: Capability) => can(role, capability),
      isAdmin: (role ?? 0) >= 20,
    }),
    [role],
  );
}

export { Role, ROLE_LABEL, roleLabel } from "./roles";
