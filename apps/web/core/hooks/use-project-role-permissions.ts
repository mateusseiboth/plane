/**
 * Hook for granular project role permission checks.
 *
 * Usage:
 *   const perms = useProjectRolePermissions();
 *   if (!perms.canWriteComments) return null;
 *   if (!perms.canMoveToState("triage", "unstarted")) return null;
 */
import { useParams } from "next/navigation";
import { EUserProjectRoles } from "@plane/types";
import {
  EProjectAction,
  canPerform,
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

  const can = (action: EProjectAction): boolean => {
    if (!role) return false;
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

  // ── State transitions — individual steps ─────────────────────────────────
  const canMoveTriageToReviewing    = can(EProjectAction.STATE_TRIAGE_TO_REVIEWING);
  const canMoveReviewingToTodo      = can(EProjectAction.STATE_REVIEWING_TO_TODO);
  const canMoveTodoToInProgress     = can(EProjectAction.STATE_TODO_TO_IN_PROGRESS);
  const canMoveInProgressToInTest   = can(EProjectAction.STATE_IN_PROGRESS_TO_IN_TEST);
  const canMoveInTestToDone         = can(EProjectAction.STATE_IN_TEST_TO_DONE);
  const canMoveInTestToInProgress   = can(EProjectAction.STATE_IN_TEST_TO_IN_PROGRESS);
  const canCancelAnything           = can(EProjectAction.STATE_ANY_TO_CANCELLED);
  const canMoveUnrestricted         = can(EProjectAction.STATE_MOVE_UNRESTRICTED);

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
    canMoveTriageToReviewing,
    canMoveReviewingToTodo,
    canMoveTodoToInProgress,
    canMoveInProgressToInTest,
    canMoveInTestToDone,
    canMoveInTestToInProgress,
    canCancelAnything,
    canMoveUnrestricted,

    /** Generic state transition check (group → group) */
    canMoveToState: (fromGroup: string, toGroup: string): boolean => {
      if (!role) return false;
      return canTransitionState(role, fromGroup, toGroup);
    },

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
