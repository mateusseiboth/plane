/**
 * Granular project role permissions.
 *
 * Architecture:
 *  - EProjectAction  : every discrete action a user can perform
 *  - ROLE_PERMISSIONS: maps each role to the set of actions it may perform
 *  - canPerform()    : check helper used by the frontend hook and backend
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

/**
 * D2 — Atendimento is a service-desk operator: it opens *chamados* (intake) and
 * talks on them, but never creates, edits or moves a work item. Mirrors
 * INTAKE_OPERATOR in apps/api-ts/src/utils/permissions.ts.
 */
const _intakeOperator: EProjectAction[] = [
  ..._viewer,
  EProjectAction.COMMENT_CREATE,
  EProjectAction.COMMENT_EDIT_OWN,
  EProjectAction.COMMENT_DELETE_OWN,
  EProjectAction.ATTACHMENT_UPLOAD,
  EProjectAction.ATTACHMENT_DELETE_OWN,
  EProjectAction.INTAKE_CREATE,
];

const _contributor: EProjectAction[] = [
  ..._intakeOperator,
  EProjectAction.ISSUE_CREATE,
  EProjectAction.ISSUE_EDIT_OWN,
  EProjectAction.ISSUE_ASSIGN_SELF,
];

export const ROLE_PERMISSIONS: Record<EUserProjectRoles, EProjectAction[]> = {
  // ── GUEST (5): read-only ───────────────────────────────────────────────────
  [EUserProjectRoles.GUEST]: [..._viewer],

  // ── ATENDIMENTO (6): service-desk operator, creates chamados only ──────────
  [EUserProjectRoles.ATENDIMENTO]: [..._intakeOperator],

  // ── QUALIDADE (8): quality team — reviews intake, approves/returns work ────
  [EUserProjectRoles.QUALIDADE]: [
    ..._contributor,
    EProjectAction.ISSUE_EDIT_ALL,
    EProjectAction.INTAKE_REVIEW,
    EProjectAction.VIEW_CREATE,
  ],

  // ── MEMBER (15): general member — full workflow access, no admin ───────────
  [EUserProjectRoles.MEMBER]: [
    ..._contributor,
    EProjectAction.ISSUE_EDIT_ALL,
    EProjectAction.ISSUE_DELETE_OWN,
    EProjectAction.ISSUE_ASSIGN_OTHERS,
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

/** Rótulo de cada EProjectAction na tela de Funções. Vocabulário do produto:
 *  "chamado" (work item) e "pedido de chamado" (intake). */
export const PROJECT_ACTION_LABELS: Record<EProjectAction, string> = {
  [EProjectAction.ISSUE_VIEW]:                  "Visualizar chamados",
  [EProjectAction.COMMENT_READ]:                "Ler comentários",
  [EProjectAction.ATTACHMENT_VIEW]:             "Visualizar anexos",
  [EProjectAction.ISSUE_CREATE]:                "Criar chamados",
  [EProjectAction.ISSUE_EDIT_OWN]:              "Editar os próprios chamados",
  [EProjectAction.ISSUE_EDIT_ALL]:              "Editar qualquer chamado",
  [EProjectAction.ISSUE_DELETE_OWN]:            "Excluir os próprios chamados",
  [EProjectAction.ISSUE_DELETE_ALL]:            "Excluir qualquer chamado",
  [EProjectAction.ISSUE_ASSIGN_SELF]:           "Atribuir-se a um chamado",
  [EProjectAction.ISSUE_ASSIGN_OTHERS]:         "Atribuir outros usuários",
  [EProjectAction.STATE_MOVE_UNRESTRICTED]:     "Mover para qualquer etapa",
  [EProjectAction.COMMENT_CREATE]:              "Comentar",
  [EProjectAction.COMMENT_EDIT_OWN]:            "Editar os próprios comentários",
  [EProjectAction.COMMENT_DELETE_OWN]:          "Excluir os próprios comentários",
  [EProjectAction.COMMENT_DELETE_ALL]:          "Excluir comentários de outros",
  [EProjectAction.ATTACHMENT_UPLOAD]:           "Enviar anexos",
  [EProjectAction.ATTACHMENT_DELETE_OWN]:       "Remover os próprios anexos",
  [EProjectAction.ATTACHMENT_DELETE_ALL]:       "Remover qualquer anexo",
  [EProjectAction.INTAKE_CREATE]:               "Abrir pedido de chamado",
  [EProjectAction.INTAKE_REVIEW]:               "Triar pedidos (aceitar/recusar)",
  [EProjectAction.CYCLE_MANAGE]:                "Gerenciar ciclos",
  [EProjectAction.MODULE_MANAGE]:               "Gerenciar módulos",
  [EProjectAction.LABEL_MANAGE]:                "Gerenciar etiquetas",
  [EProjectAction.VIEW_CREATE]:                 "Criar visualizações salvas",
  [EProjectAction.PAGE_CREATE]:                 "Criar páginas",
  [EProjectAction.MEMBER_MANAGE]:               "Gerenciar membros do sistema",
  [EProjectAction.STATE_MANAGE]:                "Gerenciar etapas do sistema",
  [EProjectAction.PROJECT_SETTINGS]:            "Configurações do sistema",
};

/**
 * Permissões agrupadas por assunto, para a tela de Funções.
 *
 * Sem agrupamento a tela mostrava 28 caixas de seleção numa grade corrida de
 * três colunas: nada indicava que "Excluir qualquer chamado" e "Excluir
 * comentários de outros" são coisas diferentes, e a leitura virava uma
 * varredura. A ordem aqui é a ordem em que a tela desenha.
 */
export const PROJECT_ACTION_GROUPS: { label: string; actions: EProjectAction[] }[] = [
  {
    label: "Chamados",
    actions: [
      EProjectAction.ISSUE_VIEW,
      EProjectAction.ISSUE_CREATE,
      EProjectAction.ISSUE_EDIT_OWN,
      EProjectAction.ISSUE_EDIT_ALL,
      EProjectAction.ISSUE_DELETE_OWN,
      EProjectAction.ISSUE_DELETE_ALL,
    ],
  },
  {
    label: "Responsáveis e etapas",
    actions: [
      EProjectAction.ISSUE_ASSIGN_SELF,
      EProjectAction.ISSUE_ASSIGN_OTHERS,
      EProjectAction.STATE_MOVE_UNRESTRICTED,
    ],
  },
  {
    label: "Comentários",
    actions: [
      EProjectAction.COMMENT_READ,
      EProjectAction.COMMENT_CREATE,
      EProjectAction.COMMENT_EDIT_OWN,
      EProjectAction.COMMENT_DELETE_OWN,
      EProjectAction.COMMENT_DELETE_ALL,
    ],
  },
  {
    label: "Anexos",
    actions: [
      EProjectAction.ATTACHMENT_VIEW,
      EProjectAction.ATTACHMENT_UPLOAD,
      EProjectAction.ATTACHMENT_DELETE_OWN,
      EProjectAction.ATTACHMENT_DELETE_ALL,
    ],
  },
  {
    label: "Solicitações",
    actions: [EProjectAction.INTAKE_CREATE, EProjectAction.INTAKE_REVIEW],
  },
  {
    label: "Organização do trabalho",
    actions: [
      EProjectAction.CYCLE_MANAGE,
      EProjectAction.MODULE_MANAGE,
      EProjectAction.LABEL_MANAGE,
      EProjectAction.VIEW_CREATE,
      EProjectAction.PAGE_CREATE,
    ],
  },
  {
    label: "Administração do sistema",
    actions: [EProjectAction.MEMBER_MANAGE, EProjectAction.STATE_MANAGE, EProjectAction.PROJECT_SETTINGS],
  },
];
