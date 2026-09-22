/**
 * Hooks para as funções configuráveis (workflow roles) do workspace.
 *
 * `GET /api/v1/workspaces/:slug/roles/` é a fonte única da verdade das
 * permissões e das transições de etapa: os mesmos registros que o backend lê em
 * `resolveRole` / `canTransition`. Não existe matriz estática espelhada no
 * frontend — enquanto a configuração não chega, os hooks informam `isLoading`
 * para que a UI desabilite o controle em vez de adivinhar uma resposta.
 *
 * Visibilidade por papel não existe mais: quem participa do projeto vê todos os
 * chamados, em qualquer etapa.
 */
import useSWR from "swr";
import { isActionAllowed } from "@/lib/permissoes/acao-efetiva";
import rolesService, { type TMyActions, type TRoleAction, type TWorkflowRole } from "@/services/roles.service";

export type TWorkspaceWorkflowRoles = {
  roles: TWorkflowRole[] | undefined;
  isLoading: boolean;
};

export type TResolvedWorkflowRole = {
  workflowRole: TWorkflowRole | undefined;
  isLoading: boolean;
};

export function useWorkspaceWorkflowRoles(workspaceSlug?: string): TWorkspaceWorkflowRoles {
  const { data, isLoading } = useSWR(
    workspaceSlug ? `WORKSPACE_WORKFLOW_ROLES_${workspaceSlug}` : null,
    workspaceSlug ? () => rolesService.list(workspaceSlug) : null,
    { revalidateOnFocus: false, revalidateIfStale: false, errorRetryCount: 2 }
  );
  return { roles: data, isLoading };
}

/** Role configurável efetiva do usuário no workspace (match por level, como o backend). */
export function useWorkflowRole(workspaceSlug?: string, roleLevel?: number): TResolvedWorkflowRole {
  const { roles, isLoading } = useWorkspaceWorkflowRoles(workspaceSlug);
  if (!roles || roleLevel === undefined) return { workflowRole: undefined, isLoading };
  return { workflowRole: roles.find((r) => r.level === roleLevel), isLoading };
}

const SWR_ONCE = { revalidateOnFocus: false, revalidateIfStale: false, errorRetryCount: 2 } as const;

/** Catálogo de ações do backend (chave, rótulo pt-BR, grupo, escopo), na ordem da tela. */
export function useRoleActionCatalog(workspaceSlug?: string) {
  const { data, isLoading, error, mutate } = useSWR<TRoleAction[]>(
    workspaceSlug ? `WORKSPACE_ROLE_ACTIONS_${workspaceSlug}` : null,
    workspaceSlug ? () => rolesService.actions(workspaceSlug) : null,
    SWR_ONCE
  );
  return { data, isLoading, error, refetch: mutate };
}

/**
 * O que quem está logado pode fazer no ESPAÇO (função + exceções por pessoa).
 * `can` responde pelas ações de escopo "workspace" (chat, relatórios, funções…).
 */
export function useMyWorkspaceActions(workspaceSlug?: string) {
  const { data, isLoading, error, mutate } = useSWR<TMyActions | undefined>(
    workspaceSlug ? `WORKSPACE_MY_ACTIONS_${workspaceSlug}` : null,
    workspaceSlug ? () => rolesService.me(workspaceSlug) : null,
    SWR_ONCE
  );
  const can = (action: string): boolean => !!data && isActionAllowed(action, data.permissions, undefined);
  return { data, isLoading, error, refetch: mutate, can };
}
