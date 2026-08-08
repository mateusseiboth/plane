/**
 * Hook for granular project role permission checks.
 *
 * Usage:
 *   const perms = useProjectRolePermissions();
 *   if (!perms.canWriteComments) return null;
 *   if (perms.isPermissionsLoading) return <Disabled />;
 *   if (!perms.canMoveToState("triage", "unstarted")) return null;
 *
 * Transição de etapa é a única regra por papel que existe no produto, e a sua
 * fonte única da verdade é a configuração de funções do workspace
 * (`GET /roles/` → `role.transitions`), a mesma tabela `role_state_transitions`
 * que o backend aplica em `canTransition()`. Não há matriz estática de fallback.
 *
 * Visibilidade por papel foi removida: quem participa do projeto enxerga todos
 * os chamados, em qualquer etapa.
 */
import { useParams } from "next/navigation";
import { EUserProjectRoles } from "@plane/types";
import { EProjectAction, canPerform } from "@plane/constants";
import { useUserPermissions } from "@/hooks/store/user";
import { useWorkflowRole } from "@/hooks/use-workflow-role";

export function useProjectRolePermissions(projectId?: string) {
  const { workspaceSlug, projectId: routerProjectId } = useParams();
  const { getProjectRoleByWorkspaceSlugAndProjectId } = useUserPermissions();

  const resolvedProjectId = projectId ?? routerProjectId?.toString();
  const slug = workspaceSlug?.toString() ?? "";

  const role: EUserProjectRoles | undefined =
    slug && resolvedProjectId
      ? (getProjectRoleByWorkspaceSlugAndProjectId(slug, resolvedProjectId) as EUserProjectRoles | undefined)
      : undefined;

  // Role configurável do workspace (tela "Funções e permissões"). Espelha o
  // resolveRole do backend: match por nível do papel legado.
  const { workflowRole, isLoading: isPermissionsLoading } = useWorkflowRole(slug, role);

  const can = (action: EProjectAction): boolean => {
    if (!role) return false;
    if (workflowRole) return workflowRole.permissions.includes(action);
    return canPerform(role, action);
  };

  // ── Viewing ──────────────────────────────────────────────────────────────
  const canViewIssues    = can(EProjectAction.ISSUE_VIEW);
  const canReadComments  = can(EProjectAction.COMMENT_READ);
  const canViewAttachments = can(EProjectAction.ATTACHMENT_VIEW);

  // ── Work-item mutations ──────────────────────────────────────────────────
  const canCreateIssue    = can(EProjectAction.ISSUE_CREATE);
  const canEditOwnIssue   = can(EProjectAction.ISSUE_EDIT_OWN);
  const canEditAllIssues  = can(EProjectAction.ISSUE_EDIT_ALL);
  /** true if user can edit AT LEAST their own issues */
  const canEditIssue      = canEditOwnIssue;
  const canDeleteOwnIssue  = can(EProjectAction.ISSUE_DELETE_OWN);
  const canDeleteAllIssues = can(EProjectAction.ISSUE_DELETE_ALL);
  /** @deprecated use canDeleteAllIssues */
  const canDeleteIssue    = canDeleteAllIssues;
  const canAssignSelf     = can(EProjectAction.ISSUE_ASSIGN_SELF);
  const canAssignOthers   = can(EProjectAction.ISSUE_ASSIGN_OTHERS);

  // ── State transitions ────────────────────────────────────────────────────
  const canMoveUnrestricted         = can(EProjectAction.STATE_MOVE_UNRESTRICTED);

  /**
   * Verifica uma transição de etapa contra `role.transitions` — exatamente as
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
    // sem `id` e libera a transição — o frontend acompanha, em vez de divergir.
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

  // ── Comments ──────────────────────────────────────────────────────────────
  const canWriteComments        = can(EProjectAction.COMMENT_CREATE);
  /** @deprecated use canWriteComments */
  const canComment              = canWriteComments;
  const canEditOwnComment       = can(EProjectAction.COMMENT_EDIT_OWN);
  const canDeleteOwnComment     = can(EProjectAction.COMMENT_DELETE_OWN);
  const canDeleteOthersComment  = can(EProjectAction.COMMENT_DELETE_ALL);

  // ── Attachments ───────────────────────────────────────────────────────────
  const canUploadAttachments    = can(EProjectAction.ATTACHMENT_UPLOAD);
  const canDeleteOwnAttachment  = can(EProjectAction.ATTACHMENT_DELETE_OWN);
  const canDeleteAllAttachments = can(EProjectAction.ATTACHMENT_DELETE_ALL);

  // ── Intake ────────────────────────────────────────────────────────────────
  const canCreateIntake  = can(EProjectAction.INTAKE_CREATE);
  const canReviewIntake  = can(EProjectAction.INTAKE_REVIEW);
  /** Accept / decline / snooze / duplicate intake issues */
  const canManageIntake  = canReviewIntake;

  // ── Project structure ─────────────────────────────────────────────────────
  const canManageCycles   = can(EProjectAction.CYCLE_MANAGE);
  const canManageModules  = can(EProjectAction.MODULE_MANAGE);
  const canManageLabels   = can(EProjectAction.LABEL_MANAGE);
  const canCreateViews    = can(EProjectAction.VIEW_CREATE);
  const canCreatePages    = can(EProjectAction.PAGE_CREATE);

  // ── Administration ────────────────────────────────────────────────────────
  const canManageMembers  = can(EProjectAction.MEMBER_MANAGE);
  const canManageStates   = can(EProjectAction.STATE_MANAGE);
  const canConfigureProject = can(EProjectAction.PROJECT_SETTINGS);

  return {
    role,
    /** true enquanto a configuração de funções do workspace não chegou. */
    isPermissionsLoading,

    // ── Viewing ──────────────────────────────────────────────────────────
    canViewIssues,
    canReadComments,
    canViewAttachments,

    // ── Work items ───────────────────────────────────────────────────────
    canCreateIssue,
    canEditOwnIssue,
    canEditAllIssues,
    canEditIssue,           // alias: canEditOwnIssue
    canDeleteOwnIssue,
    canDeleteAllIssues,
    canDeleteIssue,         // alias: canDeleteAllIssues (deprecated)
    canAssignSelf,
    canAssignOthers,

    // ── State transitions ────────────────────────────────────────────────
    canMoveUnrestricted,
    canMoveToState,

    /** Check any arbitrary action directly */
    canDo: (action: EProjectAction): boolean => can(action),

    // ── Comments ─────────────────────────────────────────────────────────
    canWriteComments,
    canComment,             // alias (deprecated)
    canEditOwnComment,
    canDeleteOwnComment,
    canDeleteOthersComment,

    // ── Attachments ──────────────────────────────────────────────────────
    canUploadAttachments,
    canDeleteOwnAttachment,
    canDeleteAllAttachments,

    // ── Intake ───────────────────────────────────────────────────────────
    canCreateIntake,
    canReviewIntake,
    canManageIntake,

    // ── Project structure ─────────────────────────────────────────────────
    canManageCycles,
    canManageModules,
    canManageLabels,
    canCreateViews,
    canCreatePages,

    // ── Administration ────────────────────────────────────────────────────
    canManageMembers,
    canManageStates,
    canConfigureProject,

    // ── Role identity helpers ─────────────────────────────────────────────
    isAtendimento:   role === EUserProjectRoles.ATENDIMENTO,
    isQualidade:     role === EUserProjectRoles.QUALIDADE,
    isTI:            role === EUserProjectRoles.TI,
    isGestorProjeto: role === EUserProjectRoles.GESTOR_PROJETO,
    isMember:        role === EUserProjectRoles.MEMBER,
    isAdmin:         role === EUserProjectRoles.ADMIN,
    isGuest:         role === EUserProjectRoles.GUEST,
  };
}
