/**
 * Granular project role permissions.
 *
 * Architecture:
 *  - EProjectAction  : every discrete action a user can perform
 *  - ROLE_PERMISSIONS: maps each role to the set of actions it may perform
 *  - canPerform()    : check helper used by the frontend hook and backend
 *  - canTransitionState() : derived from ROLE_PERMISSIONS for backward compat
 */
import { EUserProjectRoles } from "@plane/types";

// ── Granular action catalogue ─────────────────────────────────────────────────

export enum EProjectAction {
  // ── Viewing ────────────────────────────────────────────────────────────────
  /** See work items / issues */
  ISSUE_VIEW           = "issue.view",
  /** See comments on work items */
  COMMENT_READ         = "comment.read",
  /** See attachments */
  ATTACHMENT_VIEW      = "attachment.view",

  // ── Work-item mutations ────────────────────────────────────────────────────
  /** Create a new work item */
  ISSUE_CREATE         = "issue.create",
  /** Edit work items you created */
  ISSUE_EDIT_OWN       = "issue.edit.own",
  /** Edit any work item (regardless of creator) */
  ISSUE_EDIT_ALL       = "issue.edit.all",
  /** Delete work items you created */
  ISSUE_DELETE_OWN     = "issue.delete.own",
  /** Delete any work item */
  ISSUE_DELETE_ALL     = "issue.delete.all",
  /** Assign yourself to a work item */
  ISSUE_ASSIGN_SELF    = "issue.assign.self",
  /** Assign other users to a work item */
  ISSUE_ASSIGN_OTHERS  = "issue.assign.others",

  // ── State transitions (each step of the workflow) ──────────────────────────
  /** Triagem → Avaliando (quality review begins) */
  STATE_TRIAGE_TO_REVIEWING     = "state.triage_reviewing",
  /** Avaliando → A Fazer (approved by quality) */
  STATE_REVIEWING_TO_TODO       = "state.reviewing_todo",
  /** A Fazer → Em Andamento (IT starts work) */
  STATE_TODO_TO_IN_PROGRESS     = "state.todo_in_progress",
  /** Em Andamento → Em Teste (IT sends to testing) */
  STATE_IN_PROGRESS_TO_IN_TEST  = "state.in_progress_in_test",
  /** Em Teste → Concluído (IT closes after test passes) */
  STATE_IN_TEST_TO_DONE         = "state.in_test_done",
  /** Em Teste → Em Andamento (quality returns with error) */
  STATE_IN_TEST_TO_IN_PROGRESS  = "state.in_test_in_progress",
  /** Any state → Cancelado */
  STATE_ANY_TO_CANCELLED        = "state.any_cancelled",
  /** Move to any state — no workflow restrictions */
  STATE_MOVE_UNRESTRICTED       = "state.unrestricted",

  // ── Comments ───────────────────────────────────────────────────────────────
  /** Add a comment */
  COMMENT_CREATE       = "comment.create",
  /** Edit your own comments */
  COMMENT_EDIT_OWN     = "comment.edit.own",
  /** Delete your own comments */
  COMMENT_DELETE_OWN   = "comment.delete.own",
  /** Delete anyone's comments */
  COMMENT_DELETE_ALL   = "comment.delete.all",

  // ── Attachments ────────────────────────────────────────────────────────────
  /** Upload attachments to work items */
  ATTACHMENT_UPLOAD    = "attachment.upload",
  /** Remove your own attachments */
  ATTACHMENT_DELETE_OWN = "attachment.delete.own",
  /** Remove any attachment */
  ATTACHMENT_DELETE_ALL = "attachment.delete.all",

  // ── Intake ─────────────────────────────────────────────────────────────────
  /** Submit an intake / open a chamado */
  INTAKE_CREATE        = "intake.create",
  /** Accept, decline, duplicate or snooze intake issues */
  INTAKE_REVIEW        = "intake.review",

  // ── Cycles / Modules / Labels ──────────────────────────────────────────────
  CYCLE_MANAGE         = "cycle.manage",
  MODULE_MANAGE        = "module.manage",
  LABEL_MANAGE         = "label.manage",

  // ── Views / Pages ──────────────────────────────────────────────────────────
  VIEW_CREATE          = "view.create",
  PAGE_CREATE          = "page.create",

  // ── Project administration ─────────────────────────────────────────────────
  /** Add / remove / change roles of project members */
  MEMBER_MANAGE        = "member.manage",
  /** Create, edit or delete project states */
  STATE_MANAGE         = "state.manage",
  /** Rename, archive or delete the project and its settings */
  PROJECT_SETTINGS     = "project.settings",
}

// ── Role → allowed actions ────────────────────────────────────────────────────

const _viewer: EProjectAction[] = [
  EProjectAction.ISSUE_VIEW,
  EProjectAction.COMMENT_READ,
  EProjectAction.ATTACHMENT_VIEW,
];

const _contributor: EProjectAction[] = [
  ..._viewer,
  EProjectAction.ISSUE_CREATE,
  EProjectAction.ISSUE_EDIT_OWN,
  EProjectAction.ISSUE_ASSIGN_SELF,
  EProjectAction.COMMENT_CREATE,
  EProjectAction.COMMENT_EDIT_OWN,
  EProjectAction.COMMENT_DELETE_OWN,
  EProjectAction.ATTACHMENT_UPLOAD,
  EProjectAction.ATTACHMENT_DELETE_OWN,
  EProjectAction.INTAKE_CREATE,
];

export const ROLE_PERMISSIONS: Record<EUserProjectRoles, EProjectAction[]> = {
  // ── GUEST (5): read-only ───────────────────────────────────────────────────
  [EUserProjectRoles.GUEST]: [..._viewer],

  // ── ATENDIMENTO (6): service-desk operator, creates chamados only ──────────
  [EUserProjectRoles.ATENDIMENTO]: [..._contributor],

  // ── QUALIDADE (8): quality team — reviews intake, approves/returns work ────
  [EUserProjectRoles.QUALIDADE]: [
    ..._contributor,
    EProjectAction.ISSUE_EDIT_ALL,
    EProjectAction.STATE_TRIAGE_TO_REVIEWING,
    EProjectAction.STATE_REVIEWING_TO_TODO,
    EProjectAction.STATE_IN_TEST_TO_IN_PROGRESS,   // return with error
    EProjectAction.STATE_ANY_TO_CANCELLED,
    EProjectAction.INTAKE_REVIEW,
    EProjectAction.VIEW_CREATE,
  ],

  // ── MEMBER (10): general member — full workflow access, no admin ───────────
  [EUserProjectRoles.MEMBER]: [
    ..._contributor,
    EProjectAction.ISSUE_EDIT_ALL,
    EProjectAction.ISSUE_DELETE_OWN,
    EProjectAction.ISSUE_ASSIGN_OTHERS,
    EProjectAction.STATE_TRIAGE_TO_REVIEWING,
    EProjectAction.STATE_REVIEWING_TO_TODO,
    EProjectAction.STATE_TODO_TO_IN_PROGRESS,
    EProjectAction.STATE_IN_PROGRESS_TO_IN_TEST,
    EProjectAction.STATE_IN_TEST_TO_DONE,
    EProjectAction.STATE_IN_TEST_TO_IN_PROGRESS,
    EProjectAction.STATE_ANY_TO_CANCELLED,
    EProjectAction.INTAKE_REVIEW,
    EProjectAction.CYCLE_MANAGE,
    EProjectAction.MODULE_MANAGE,
    EProjectAction.LABEL_MANAGE,
    EProjectAction.VIEW_CREATE,
    EProjectAction.PAGE_CREATE,
  ],

  // ── TI (12): IT team — executes work from A Fazer through completion ────────
  [EUserProjectRoles.TI]: [
    ..._contributor,
    EProjectAction.ISSUE_EDIT_ALL,
    EProjectAction.ISSUE_ASSIGN_OTHERS,
    EProjectAction.STATE_TODO_TO_IN_PROGRESS,
    EProjectAction.STATE_IN_PROGRESS_TO_IN_TEST,
    EProjectAction.STATE_IN_TEST_TO_DONE,
    EProjectAction.STATE_ANY_TO_CANCELLED,
    EProjectAction.CYCLE_MANAGE,
    EProjectAction.MODULE_MANAGE,
    EProjectAction.VIEW_CREATE,
  ],

  // ── GESTOR_PROJETO (18): project manager — full project control ────────────
  [EUserProjectRoles.GESTOR_PROJETO]: [
    ..._contributor,
    EProjectAction.ISSUE_EDIT_ALL,
    EProjectAction.ISSUE_DELETE_OWN,
    EProjectAction.ISSUE_DELETE_ALL,
    EProjectAction.ISSUE_ASSIGN_OTHERS,
    EProjectAction.STATE_TRIAGE_TO_REVIEWING,
    EProjectAction.STATE_REVIEWING_TO_TODO,
    EProjectAction.STATE_TODO_TO_IN_PROGRESS,
    EProjectAction.STATE_IN_PROGRESS_TO_IN_TEST,
    EProjectAction.STATE_IN_TEST_TO_DONE,
    EProjectAction.STATE_IN_TEST_TO_IN_PROGRESS,
    EProjectAction.STATE_ANY_TO_CANCELLED,
    EProjectAction.STATE_MOVE_UNRESTRICTED,
    EProjectAction.COMMENT_DELETE_ALL,
    EProjectAction.ATTACHMENT_DELETE_ALL,
    EProjectAction.INTAKE_REVIEW,
    EProjectAction.CYCLE_MANAGE,
    EProjectAction.MODULE_MANAGE,
    EProjectAction.LABEL_MANAGE,
    EProjectAction.VIEW_CREATE,
    EProjectAction.PAGE_CREATE,
    EProjectAction.MEMBER_MANAGE,
  ],

  // ── ADMIN (20): full access ────────────────────────────────────────────────
  [EUserProjectRoles.ADMIN]: Object.values(EProjectAction) as EProjectAction[],
};

// ── Core check helpers ────────────────────────────────────────────────────────

/** Returns true if `role` is allowed to perform `action`. */
export function canPerform(role: EUserProjectRoles | number, action: EProjectAction): boolean {
  const allowed = ROLE_PERMISSIONS[role as EUserProjectRoles];
  if (!allowed) return false;
  return allowed.includes(action);
}

/**
 * Returns whether the given role can move an issue from `fromGroup` to `toGroup`.
 * Derived from the ROLE_PERMISSIONS action matrix.
 */
export function canTransitionState(
  role: EUserProjectRoles | number,
  fromGroup: string,
  toGroup: string
): boolean {
  if (canPerform(role, EProjectAction.STATE_MOVE_UNRESTRICTED)) return true;

  if (toGroup === "cancelled") return canPerform(role, EProjectAction.STATE_ANY_TO_CANCELLED);

  if (fromGroup === "triage") {
    if (toGroup === "triage") return true; // stay in triage (no-op)
    if (toGroup === "unstarted") return canPerform(role, EProjectAction.STATE_TRIAGE_TO_REVIEWING);
    return false;
  }

  if (fromGroup === "unstarted" && toGroup === "unstarted") {
    // Avaliando → A Fazer (both unstarted, Qualidade approves)
    return canPerform(role, EProjectAction.STATE_REVIEWING_TO_TODO);
  }

  if (fromGroup === "unstarted" && toGroup === "started") {
    return canPerform(role, EProjectAction.STATE_TODO_TO_IN_PROGRESS);
  }

  if (fromGroup === "started" && toGroup === "started") {
    // Two directions: In Progress → In Test (TI) or In Test → In Progress (Qualidade)
    return (
      canPerform(role, EProjectAction.STATE_IN_PROGRESS_TO_IN_TEST) ||
      canPerform(role, EProjectAction.STATE_IN_TEST_TO_IN_PROGRESS)
    );
  }

  if (fromGroup === "started" && toGroup === "completed") {
    return canPerform(role, EProjectAction.STATE_IN_TEST_TO_DONE);
  }

  // backlog ↔ unstarted and other minor moves: allow for MEMBER+ (generous default)
  if (["backlog", "unstarted"].includes(fromGroup) && ["backlog", "unstarted"].includes(toGroup)) {
    return canPerform(role, EProjectAction.STATE_TODO_TO_IN_PROGRESS);
  }

  return false;
}

// ── Backward-compat role lists (used in a few older UI guards) ────────────────

/** @deprecated Use canPerform(role, EProjectAction.ISSUE_VIEW) instead */
export const ROLES_CAN_VIEW = Object.values(EUserProjectRoles).filter(
  (r) => canPerform(r as EUserProjectRoles, EProjectAction.ISSUE_VIEW)
) as EUserProjectRoles[];

/** @deprecated Use canPerform(role, EProjectAction.ISSUE_EDIT_ALL) instead */
export const ROLES_CAN_EDIT = Object.values(EUserProjectRoles).filter(
  (r) => canPerform(r as EUserProjectRoles, EProjectAction.ISSUE_EDIT_ALL)
) as EUserProjectRoles[];

/** @deprecated Use canPerform(role, EProjectAction.INTAKE_CREATE) instead */
export const ROLES_CAN_CREATE_INTAKE = Object.values(EUserProjectRoles).filter(
  (r) => canPerform(r as EUserProjectRoles, EProjectAction.INTAKE_CREATE)
) as EUserProjectRoles[];

/** @deprecated Use canPerform(role, EProjectAction.COMMENT_CREATE) instead */
export const ROLES_CAN_COMMENT = Object.values(EUserProjectRoles).filter(
  (r) => canPerform(r as EUserProjectRoles, EProjectAction.COMMENT_CREATE)
) as EUserProjectRoles[];

/** @deprecated Use canPerform(role, EProjectAction.ISSUE_DELETE_ALL) instead */
export const ROLES_CAN_DELETE_ISSUES = Object.values(EUserProjectRoles).filter(
  (r) => canPerform(r as EUserProjectRoles, EProjectAction.ISSUE_DELETE_ALL)
) as EUserProjectRoles[];

/** @deprecated Use canPerform(role, EProjectAction.COMMENT_DELETE_ALL) instead */
export const ROLES_CAN_DELETE_OTHERS_COMMENTS = Object.values(EUserProjectRoles).filter(
  (r) => canPerform(r as EUserProjectRoles, EProjectAction.COMMENT_DELETE_ALL)
) as EUserProjectRoles[];

/** @deprecated Use canPerform(role, EProjectAction.MEMBER_MANAGE) instead */
export const ROLES_CAN_MANAGE_MEMBERS = Object.values(EUserProjectRoles).filter(
  (r) => canPerform(r as EUserProjectRoles, EProjectAction.MEMBER_MANAGE)
) as EUserProjectRoles[];

/** @deprecated Use canPerform(role, EProjectAction.STATE_MANAGE) instead */
export const ROLES_CAN_MANAGE_STATES = Object.values(EUserProjectRoles).filter(
  (r) => canPerform(r as EUserProjectRoles, EProjectAction.STATE_MANAGE)
) as EUserProjectRoles[];

/** @deprecated Use canPerform(role, EProjectAction.PROJECT_SETTINGS) instead */
export const ROLES_CAN_CONFIGURE_PROJECT = Object.values(EUserProjectRoles).filter(
  (r) => canPerform(r as EUserProjectRoles, EProjectAction.PROJECT_SETTINGS)
) as EUserProjectRoles[];

// ── Role metadata ──────────────────────────────────────────────────────────────

export const PROJECT_ROLE_LABELS: Record<EUserProjectRoles, string> = {
  [EUserProjectRoles.ADMIN]:          "Administrador",
  [EUserProjectRoles.GESTOR_PROJETO]: "Gestor de Projeto",
  [EUserProjectRoles.MEMBER]:         "Membro",
  [EUserProjectRoles.TI]:             "TI",
  [EUserProjectRoles.QUALIDADE]:      "Qualidade",
  [EUserProjectRoles.ATENDIMENTO]:    "Atendimento",
  [EUserProjectRoles.GUEST]:          "Visualizador",
};

export const ALL_PROJECT_ROLES = [
  EUserProjectRoles.ADMIN,
  EUserProjectRoles.GESTOR_PROJETO,
  EUserProjectRoles.MEMBER,
  EUserProjectRoles.TI,
  EUserProjectRoles.QUALIDADE,
  EUserProjectRoles.ATENDIMENTO,
  EUserProjectRoles.GUEST,
];

/** Human-readable label for each EProjectAction (for settings UI) */
export const PROJECT_ACTION_LABELS: Record<EProjectAction, string> = {
  [EProjectAction.ISSUE_VIEW]:                  "Visualizar work items",
  [EProjectAction.COMMENT_READ]:                "Ler comentários",
  [EProjectAction.ATTACHMENT_VIEW]:             "Visualizar anexos",
  [EProjectAction.ISSUE_CREATE]:                "Criar work items",
  [EProjectAction.ISSUE_EDIT_OWN]:              "Editar próprios work items",
  [EProjectAction.ISSUE_EDIT_ALL]:              "Editar qualquer work item",
  [EProjectAction.ISSUE_DELETE_OWN]:            "Excluir próprios work items",
  [EProjectAction.ISSUE_DELETE_ALL]:            "Excluir qualquer work item",
  [EProjectAction.ISSUE_ASSIGN_SELF]:           "Atribuir-se a um work item",
  [EProjectAction.ISSUE_ASSIGN_OTHERS]:         "Atribuir outros usuários",
  [EProjectAction.STATE_TRIAGE_TO_REVIEWING]:   "Mover: Triagem → Avaliando",
  [EProjectAction.STATE_REVIEWING_TO_TODO]:     "Mover: Avaliando → A Fazer",
  [EProjectAction.STATE_TODO_TO_IN_PROGRESS]:   "Mover: A Fazer → Em Andamento",
  [EProjectAction.STATE_IN_PROGRESS_TO_IN_TEST]:"Mover: Em Andamento → Em Teste",
  [EProjectAction.STATE_IN_TEST_TO_DONE]:       "Mover: Em Teste → Concluído",
  [EProjectAction.STATE_IN_TEST_TO_IN_PROGRESS]:"Mover: Em Teste → Em Andamento (devolução)",
  [EProjectAction.STATE_ANY_TO_CANCELLED]:      "Cancelar work item",
  [EProjectAction.STATE_MOVE_UNRESTRICTED]:     "Mover para qualquer estado",
  [EProjectAction.COMMENT_CREATE]:              "Comentar",
  [EProjectAction.COMMENT_EDIT_OWN]:            "Editar próprios comentários",
  [EProjectAction.COMMENT_DELETE_OWN]:          "Excluir próprios comentários",
  [EProjectAction.COMMENT_DELETE_ALL]:          "Excluir comentários de outros",
  [EProjectAction.ATTACHMENT_UPLOAD]:           "Enviar anexos",
  [EProjectAction.ATTACHMENT_DELETE_OWN]:       "Remover próprios anexos",
  [EProjectAction.ATTACHMENT_DELETE_ALL]:       "Remover qualquer anexo",
  [EProjectAction.INTAKE_CREATE]:               "Abrir intake (chamado)",
  [EProjectAction.INTAKE_REVIEW]:               "Revisar intakes (aceitar/recusar)",
  [EProjectAction.CYCLE_MANAGE]:                "Gerenciar ciclos",
  [EProjectAction.MODULE_MANAGE]:               "Gerenciar módulos",
  [EProjectAction.LABEL_MANAGE]:                "Gerenciar labels",
  [EProjectAction.VIEW_CREATE]:                 "Criar visualizações salvas",
  [EProjectAction.PAGE_CREATE]:                 "Criar páginas",
  [EProjectAction.MEMBER_MANAGE]:               "Gerenciar membros do projeto",
  [EProjectAction.STATE_MANAGE]:                "Gerenciar estados do projeto",
  [EProjectAction.PROJECT_SETTINGS]:            "Configurações do projeto",
};
