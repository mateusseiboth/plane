/**
 * Granular project role permissions.
 * Maps roles to the actions they are allowed to perform.
 */
import { EUserProjectRoles } from "@plane/types";

// ── Role groups ───────────────────────────────────────────────────────────────

/** Roles that can view issues and project data */
export const ROLES_CAN_VIEW = [
  EUserProjectRoles.ADMIN,
  EUserProjectRoles.GESTOR_PROJETO,
  EUserProjectRoles.MEMBER,
  EUserProjectRoles.TI,
  EUserProjectRoles.QUALIDADE,
  EUserProjectRoles.ATENDIMENTO,
  EUserProjectRoles.GUEST,
];

/** Roles that can create and edit issues (not intake-only) */
export const ROLES_CAN_EDIT = [
  EUserProjectRoles.ADMIN,
  EUserProjectRoles.GESTOR_PROJETO,
  EUserProjectRoles.MEMBER,
  EUserProjectRoles.TI,
  EUserProjectRoles.QUALIDADE,
];

/** Roles that can create intake issues (everyone except guest) */
export const ROLES_CAN_CREATE_INTAKE = [
  EUserProjectRoles.ADMIN,
  EUserProjectRoles.GESTOR_PROJETO,
  EUserProjectRoles.MEMBER,
  EUserProjectRoles.TI,
  EUserProjectRoles.QUALIDADE,
  EUserProjectRoles.ATENDIMENTO,
];

/** Roles that can comment */
export const ROLES_CAN_COMMENT = [
  EUserProjectRoles.ADMIN,
  EUserProjectRoles.GESTOR_PROJETO,
  EUserProjectRoles.MEMBER,
  EUserProjectRoles.TI,
  EUserProjectRoles.QUALIDADE,
  EUserProjectRoles.ATENDIMENTO,
];

/** Roles that can delete issues */
export const ROLES_CAN_DELETE_ISSUES = [
  EUserProjectRoles.ADMIN,
  EUserProjectRoles.GESTOR_PROJETO,
];

/** Roles that can delete others' comments */
export const ROLES_CAN_DELETE_OTHERS_COMMENTS = [
  EUserProjectRoles.ADMIN,
  EUserProjectRoles.GESTOR_PROJETO,
];

/** Roles that can manage project members */
export const ROLES_CAN_MANAGE_MEMBERS = [
  EUserProjectRoles.ADMIN,
  EUserProjectRoles.GESTOR_PROJETO,
];

/** Roles that can manage states and labels */
export const ROLES_CAN_MANAGE_STATES = [
  EUserProjectRoles.ADMIN,
];

/** Roles that can access project settings */
export const ROLES_CAN_CONFIGURE_PROJECT = [
  EUserProjectRoles.ADMIN,
];

// ── State transition rules ────────────────────────────────────────────────────

/**
 * Defines which state groups a role is allowed to move TO.
 * Undefined means no restriction (all groups allowed).
 *
 * State group flow: triage → unstarted → started → completed/cancelled
 */
export const ROLE_STATE_TRANSITION_RULES: Record<EUserProjectRoles, string[] | undefined> = {
  [EUserProjectRoles.ADMIN]: undefined,
  [EUserProjectRoles.GESTOR_PROJETO]: undefined,
  [EUserProjectRoles.MEMBER]: undefined,
  // TI: can move from unstarted/backlog → started, started → started, started → completed/cancelled
  [EUserProjectRoles.TI]: ["started", "completed", "cancelled", "backlog", "unstarted"],
  // Qualidade: can move from triage → unstarted (approve), started(In Test) → started(In Progress) devolution
  [EUserProjectRoles.QUALIDADE]: ["triage", "unstarted", "started", "completed", "cancelled"],
  // Atendimento: can only create intake; no state transitions allowed manually
  [EUserProjectRoles.ATENDIMENTO]: ["triage"],
  [EUserProjectRoles.GUEST]: [],
};

/**
 * Returns whether the given role can move an issue from `fromGroup` to `toGroup`.
 */
export function canTransitionState(
  role: EUserProjectRoles | number,
  fromGroup: string,
  toGroup: string
): boolean {
  const allowed = ROLE_STATE_TRANSITION_RULES[role as EUserProjectRoles];
  if (allowed === undefined) return true; // no restriction
  if (allowed.length === 0) return false;

  // Atendimento can only keep item in triage
  if (role === EUserProjectRoles.ATENDIMENTO) return toGroup === "triage";

  // TI: cannot pick up from triage (that's Qualidade's job)
  if (role === EUserProjectRoles.TI && fromGroup === "triage") return false;

  // Qualidade: can move from triage → unstarted (approve) but not from other groups freely
  if (role === EUserProjectRoles.QUALIDADE) {
    if (fromGroup === "triage") return toGroup === "unstarted" || toGroup === "triage";
    // Can also return from started(In Test) → started(In Progress) — same group, allowed
    if (fromGroup === "started" && toGroup === "started") return true;
    // Can mark as completed/cancelled
    if (toGroup === "completed" || toGroup === "cancelled") return true;
    return false;
  }

  return allowed.includes(toGroup);
}

// ── Role labels ───────────────────────────────────────────────────────────────

export const PROJECT_ROLE_LABELS: Record<EUserProjectRoles, string> = {
  [EUserProjectRoles.ADMIN]: "Administrador",
  [EUserProjectRoles.GESTOR_PROJETO]: "Gestor de Projeto",
  [EUserProjectRoles.MEMBER]: "Membro",
  [EUserProjectRoles.TI]: "TI",
  [EUserProjectRoles.QUALIDADE]: "Qualidade",
  [EUserProjectRoles.ATENDIMENTO]: "Atendimento",
  [EUserProjectRoles.GUEST]: "Visualizador",
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
