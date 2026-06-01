/**
 * Role model mirrored from the backend / web
 * (packages/constants/src/workspace.ts `ROLE` and user.ts `EUserPermissions`).
 *
 * Workspace membership roles are capped at MEMBER (15); finer-grained sector
 * roles (ATENDIMENTO, QUALIDADE, TI, GESTOR_PROJETO) live on the *project*
 * membership. Project-scoped screens therefore evaluate permissions against the
 * project role when available, falling back to the workspace role.
 */

export enum Role {
  GUEST = 5, // Visualizador
  ATENDIMENTO = 6, // Service desk — opens tickets
  QUALIDADE = 8, // Quality — reviews intake, approves/returns
  TI = 12, // IT — works tickets, moves status
  MEMBER = 15, // Membro
  GESTOR_PROJETO = 18, // Project manager
  ADMIN = 20, // Administrador
}

export const ROLE_LABEL: Record<number, string> = {
  [Role.GUEST]: "Visualizador",
  [Role.ATENDIMENTO]: "Atendimento",
  [Role.QUALIDADE]: "Qualidade",
  [Role.TI]: "TI",
  [Role.MEMBER]: "Membro",
  [Role.GESTOR_PROJETO]: "Gestor de Projeto",
  [Role.ADMIN]: "Administrador",
};

/**
 * Capability → minimum role. Thresholds follow the SAC sector model:
 * - Atendimento can open intakes.
 * - Quality can additionally create/triage work items.
 * - IT and above can move status and reassign the entity.
 * - Members can edit the wiki.
 * - Only admins can reassign the responsible user (explicit product rule) and
 *   trigger a search reindex.
 */
export const CAPABILITY_MIN_ROLE = {
  view: Role.GUEST,
  createIntake: Role.ATENDIMENTO,
  createWorkItem: Role.QUALIDADE,
  changeStatus: Role.TI,
  changeEntity: Role.TI,
  manageVisits: Role.TI,
  editWiki: Role.MEMBER,
  changeAssignee: Role.ADMIN,
  reindexSearch: Role.ADMIN,
} as const;

export type Capability = keyof typeof CAPABILITY_MIN_ROLE;

export function roleLabel(role: number | undefined | null): string {
  if (role == null) return "—";
  return ROLE_LABEL[role] ?? `Role ${role}`;
}

export function can(role: number | undefined | null, capability: Capability): boolean {
  if (role == null) return false;
  return role >= CAPABILITY_MIN_ROLE[capability];
}
