/**
 * Permissões dentro de um sistema (projeto), para quem está logado.
 *
 * Usage:
 *   const { canChangePriority, canMoveToState, isPermissionsLoading } = useProjectRolePermissions();
 *
 * Toda decisão sai da matriz de ações (`GET /roles/me/`: função + exceções por
 * pessoa), a mesma que o api-ts confere; não há matriz por nível de papel no
 * web. Participar do sistema (`role` do vínculo) é o que restringe ao sistema.
 *
 * Transição de etapa usa a configuração de funções do workspace
 * (`GET /roles/` → `role.transitions`), a mesma tabela `role_state_transitions`
 * que o backend aplica em `canTransition()`.
 */
import { useParams } from "next/navigation";
import type { EUserProjectRoles } from "@plane/types";
import { useUserPermissions } from "@/hooks/store/user";
import { useMyWorkspaceActions, useWorkflowRole } from "@/hooks/use-workflow-role";

export function useProjectRolePermissions(projectId?: string) {
  const { workspaceSlug, projectId: routerProjectId } = useParams();
  const { getProjectRoleByWorkspaceSlugAndProjectId } = useUserPermissions();

  const resolvedProjectId = projectId ?? routerProjectId?.toString();
  const slug = workspaceSlug?.toString() ?? "";

  const role: EUserProjectRoles | undefined =
    slug && resolvedProjectId
      ? (getProjectRoleByWorkspaceSlugAndProjectId(slug, resolvedProjectId) as EUserProjectRoles | undefined)
      : undefined;

  // Role configurável do workspace (tela "Funções e permissões"): só as
  // transições de etapa saem dela.
  const { workflowRole, isLoading: isRolesLoading } = useWorkflowRole(slug, role);
  const { can: canInWorkspace, isLoading: isMyActionsLoading } = useMyWorkspaceActions(slug);
  const isPermissionsLoading = isRolesLoading || isMyActionsLoading;

  const can = (action: string): boolean => !!role && canInWorkspace(action);

  const canMoveUnrestricted = can("state.unrestricted");

  /**
   * Verifica uma transição de etapa contra `role.transitions`, exatamente as
   * linhas que o backend consulta em `canTransition()`.
   *
   * Enquanto a configuração de funções não chegou devolve `false`: quem chama
   * deve usar `isPermissionsLoading` para desabilitar o controle em vez de
   * receber uma resposta inventada.
   */
  const canMoveToState = (fromGroup: string, toGroup: string, fromName?: string, toName?: string): boolean => {
    if (!role || isPermissionsLoading) return false;
    if (fromName && toName && fromName === toName) return true; // no-op move
    // Papel sem função configurada no workspace: o backend resolve para um papel
    // sem `id` e libera a transição; o frontend acompanha, em vez de divergir.
    if (!workflowRole) return true;
    if (canMoveUnrestricted) return true;
    return workflowRole.transitions.some(
      (t) =>
        t.allowed &&
        t.from_group === fromGroup &&
        (t.from_state_name === null || !fromName || t.from_state_name === fromName) &&
        t.to_group === toGroup &&
        (t.to_state_name === null || !toName || t.to_state_name === toName)
    );
  };

  return {
    role,
    /** true enquanto a configuração de funções do workspace não chegou. */
    isPermissionsLoading,
    /** Qualquer ação do catálogo, dentro deste sistema. */
    canDo: can,
    canMoveUnrestricted,
    canMoveToState,
    /** Alterar a prioridade (Gestor e admin por padrão; demais por concessão). */
    canChangePriority: can("issue.priority"),
    canCreateIntake: can("intake.create"),
    canDeleteOthersComment: can("comment.delete.all"),
  };
}
