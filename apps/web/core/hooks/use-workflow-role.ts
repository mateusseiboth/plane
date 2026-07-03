/**
 * Hooks para as funções configuráveis (workflow roles) do workspace.
 *
 * O backend (apps/api-ts/src/modules/roles) armazena por workspace as roles
 * com permissões, visibilidade de quadros e transições de etapa editáveis na
 * tela de configurações. Estes hooks espelham `resolveRole` do backend:
 * a role efetiva do usuário é resolvida pelo `level` (papel numérico legado).
 */
import useSWR from "swr";
import rolesService, { type TWorkflowRole } from "@/services/roles.service";

export function useWorkspaceWorkflowRoles(workspaceSlug?: string): TWorkflowRole[] | undefined {
  const { data } = useSWR(
    workspaceSlug ? `WORKSPACE_WORKFLOW_ROLES_${workspaceSlug}` : null,
    workspaceSlug ? () => rolesService.list(workspaceSlug) : null,
    { revalidateOnFocus: false, revalidateIfStale: false, errorRetryCount: 2 }
  );
  return data;
}

/** Role configurável efetiva do usuário no workspace (match por level, como o backend). */
export function useWorkflowRole(workspaceSlug?: string, roleLevel?: number): TWorkflowRole | undefined {
  const roles = useWorkspaceWorkflowRoles(workspaceSlug);
  if (!roles || roleLevel === undefined) return undefined;
  return roles.find((r) => r.level === roleLevel);
}
