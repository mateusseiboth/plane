// Configurable roles / workflow (H1–H3).
//
// The action catalogue mirrors packages/constants/src/project-permissions.ts.
// Defaults seed the 7 system roles plus the granular board-visibility and
// state-transition rules described by the product owner. Everything here is just
// the *default*; admins edit the live config (WorkflowRole / RoleStateVisibility
// / RoleStateTransition rows) through the roles API.
//
// Visibility semantics: if a role has ZERO visibility rows it sees everything
// (open by default). If it has any rows, they form an allow-list — the role sees
// only the listed (group, stateName) combinations.
//
// Transition semantics: roles whose permissions include STATE_MOVE_UNRESTRICTED
// move freely. Otherwise a transition is allowed only if a matching
// RoleStateTransition row exists (or the move stays within the same state).
//
// This module is intentionally free of the @db singleton so the seed scripts can
// import it. DB-coupled runtime checks live in utils/permission-checks.ts.

export enum EProjectAction {
  ISSUE_VIEW = "issue.view",
  COMMENT_READ = "comment.read",
  ATTACHMENT_VIEW = "attachment.view",
  ISSUE_CREATE = "issue.create",
  ISSUE_EDIT_OWN = "issue.edit.own",
  ISSUE_EDIT_ALL = "issue.edit.all",
  ISSUE_DELETE_OWN = "issue.delete.own",
  ISSUE_DELETE_ALL = "issue.delete.all",
  ISSUE_ASSIGN_SELF = "issue.assign.self",
  ISSUE_ASSIGN_OTHERS = "issue.assign.others",
  STATE_MOVE_UNRESTRICTED = "state.unrestricted",
  COMMENT_CREATE = "comment.create",
  COMMENT_EDIT_OWN = "comment.edit.own",
  COMMENT_DELETE_OWN = "comment.delete.own",
  COMMENT_DELETE_ALL = "comment.delete.all",
  ATTACHMENT_UPLOAD = "attachment.upload",
  ATTACHMENT_DELETE_OWN = "attachment.delete.own",
  ATTACHMENT_DELETE_ALL = "attachment.delete.all",
  INTAKE_CREATE = "intake.create",
  INTAKE_REVIEW = "intake.review",
  CYCLE_MANAGE = "cycle.manage",
  MODULE_MANAGE = "module.manage",
  LABEL_MANAGE = "label.manage",
  VIEW_CREATE = "view.create",
  PAGE_CREATE = "page.create",
  MEMBER_MANAGE = "member.manage",
  STATE_MANAGE = "state.manage",
  PROJECT_SETTINGS = "project.settings",
}

export const ALL_ACTIONS = Object.values(EProjectAction);

const VIEWER = [EProjectAction.ISSUE_VIEW, EProjectAction.COMMENT_READ, EProjectAction.ATTACHMENT_VIEW];
const CONTRIBUTOR = [
  ...VIEWER,
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

export type DefaultRole = {
  key: string;
  name: string;
  level: number; // mirrors the legacy role Int
  permissions: EProjectAction[];
};

// 7 system roles — keys/levels match the legacy role integers.
export const DEFAULT_ROLES: DefaultRole[] = [
  {key: "guest", name: "Visualizador", level: 5, permissions: [...VIEWER]},
  {key: "atendimento", name: "Atendimento", level: 6, permissions: [...CONTRIBUTOR]},
  {
    key: "qualidade",
    name: "Qualidade",
    level: 8,
    permissions: [...CONTRIBUTOR, EProjectAction.ISSUE_EDIT_ALL, EProjectAction.INTAKE_REVIEW, EProjectAction.VIEW_CREATE],
  },
  {
    key: "member",
    name: "Membro",
    level: 10,
    permissions: [
      ...CONTRIBUTOR,
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
  },
  {
    key: "ti",
    name: "TI",
    level: 12,
    permissions: [
      ...CONTRIBUTOR,
      EProjectAction.ISSUE_EDIT_ALL,
      EProjectAction.ISSUE_ASSIGN_OTHERS,
      EProjectAction.CYCLE_MANAGE,
      EProjectAction.MODULE_MANAGE,
      EProjectAction.VIEW_CREATE,
    ],
  },
  {
    key: "gestor_projeto",
    name: "Gestor de Projeto",
    level: 18,
    permissions: [
      ...CONTRIBUTOR,
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
      EProjectAction.STATE_MANAGE,
    ],
  },
  {key: "admin", name: "Administrador", level: 20, permissions: [...ALL_ACTIONS]},
];

// Default state names (must match DEFAULT_STATES in scripts/migrate-sac.ts).
export const STATE = {
  TRIAGEM: "Triagem",
  PENDENCIAS: "Pendências",
  A_FAZER: "A Fazer",
  EM_ANALISE: "Em Análise",
  EM_DESENVOLVIMENTO: "Em Desenvolvimento",
  EM_TESTE: "Em Teste",
  CONCLUIDO: "Concluído",
  CANCELADO: "Cancelado",
} as const;

export type VisibilityRule = {group: string; stateName?: string | null};
export type TransitionRule = {fromGroup: string; fromStateName?: string | null; toGroup: string; toStateName?: string | null};

// Allow-list visibility for the restricted roles. Roles not listed here see all.
export const DEFAULT_VISIBILITY: Record<string, VisibilityRule[]> = {
  qualidade: [
    {group: "triage"}, // intake (Triagem)
    {group: "started", stateName: STATE.EM_ANALISE},
    {group: "started", stateName: STATE.EM_TESTE},
    {group: "completed"},
    {group: "cancelled"},
  ],
  ti: [
    {group: "unstarted"}, // A Fazer
    {group: "started", stateName: STATE.EM_DESENVOLVIMENTO},
    {group: "completed"},
    {group: "cancelled"},
  ],
  atendimento: [
    {group: "triage"},
    {group: "completed"},
    {group: "cancelled"},
  ],
};

// Default transition matrix for non-unrestricted roles. Admin/Gestor move freely.
export const DEFAULT_TRANSITIONS: Record<string, TransitionRule[]> = {
  qualidade: [
    {fromGroup: "triage", toGroup: "unstarted", toStateName: STATE.A_FAZER}, // aprova intake → A Fazer
    {fromGroup: "unstarted", fromStateName: STATE.A_FAZER, toGroup: "started", toStateName: STATE.EM_ANALISE}, // envia para análise
    {fromGroup: "started", fromStateName: STATE.EM_ANALISE, toGroup: "started", toStateName: STATE.EM_DESENVOLVIMENTO},
    {fromGroup: "started", fromStateName: STATE.EM_TESTE, toGroup: "started", toStateName: STATE.EM_DESENVOLVIMENTO}, // devolução
    {fromGroup: "started", fromStateName: STATE.EM_TESTE, toGroup: "completed"}, // conclui após teste
    {fromGroup: "triage", toGroup: "cancelled"},
    {fromGroup: "started", toGroup: "cancelled"},
    {fromGroup: "unstarted", toGroup: "cancelled"},
  ],
  ti: [
    {fromGroup: "unstarted", fromStateName: STATE.A_FAZER, toGroup: "started", toStateName: STATE.EM_DESENVOLVIMENTO},
    {fromGroup: "started", fromStateName: STATE.EM_ANALISE, toGroup: "started", toStateName: STATE.EM_DESENVOLVIMENTO},
    {fromGroup: "started", fromStateName: STATE.EM_DESENVOLVIMENTO, toGroup: "started", toStateName: STATE.EM_TESTE},
    {fromGroup: "started", fromStateName: STATE.EM_TESTE, toGroup: "completed"},
    {fromGroup: "started", toGroup: "cancelled"},
    {fromGroup: "unstarted", toGroup: "cancelled"},
  ],
  atendimento: [
    {fromGroup: "triage", toGroup: "triage"}, // só mantém em triagem
  ],
  member: [
    {fromGroup: "triage", toGroup: "unstarted"},
    {fromGroup: "backlog", toGroup: "unstarted"},
    {fromGroup: "unstarted", toGroup: "backlog"},
    {fromGroup: "unstarted", toGroup: "started"},
    {fromGroup: "started", toGroup: "started"},
    {fromGroup: "started", toGroup: "completed"},
    {fromGroup: "backlog", toGroup: "started"},
    {fromGroup: "triage", toGroup: "cancelled"},
    {fromGroup: "backlog", toGroup: "cancelled"},
    {fromGroup: "unstarted", toGroup: "cancelled"},
    {fromGroup: "started", toGroup: "cancelled"},
  ],
  // guest: nenhuma transição
};

// ── Runtime helpers (read live config from the DB) ────────────────────────────

export type EffectiveRole = {
  id: string | null;
  key: string;
  level: number;
  permissions: string[];
};

/**
 * Idempotently seed the 7 system roles + default visibility/transition rules for
 * a workspace, then link any members that don't yet have a workflowRole (by
 * mapping their legacy role Int to the closest system role level).
 * Accepts a PrismaClient instance so it works from seed.ts and the migration.
 */
export async function seedWorkflowRoles(db: any, workspaceId: string): Promise<Record<string, string>> {
  const keyToId: Record<string, string> = {};
  for (const def of DEFAULT_ROLES) {
    let role = await db.workflowRole.findFirst({where: {workspaceId, key: def.key, deletedAt: null}});
    if (!role) {
      role = await db.workflowRole.create({
        data: {workspaceId, key: def.key, name: def.name, level: def.level, isSystem: true, permissions: def.permissions},
      });
    }
    keyToId[def.key] = role.id;
  }

  for (const [key, rules] of Object.entries(DEFAULT_VISIBILITY)) {
    const roleId = keyToId[key];
    if (!roleId) continue;
    if ((await db.roleStateVisibility.count({where: {roleId}})) === 0) {
      await db.roleStateVisibility.createMany({
        data: rules.map((r) => ({roleId, workspaceId, group: r.group, stateName: r.stateName ?? null, canView: true})),
      });
    }
  }

  for (const [key, rules] of Object.entries(DEFAULT_TRANSITIONS)) {
    const roleId = keyToId[key];
    if (!roleId) continue;
    if ((await db.roleStateTransition.count({where: {roleId}})) === 0) {
      await db.roleStateTransition.createMany({
        data: rules.map((r) => ({
          roleId,
          workspaceId,
          fromGroup: r.fromGroup,
          fromStateName: r.fromStateName ?? null,
          toGroup: r.toGroup,
          toStateName: r.toStateName ?? null,
          allowed: true,
        })),
      });
    }
  }

  const pickKey = (roleInt: number) =>
    ([...DEFAULT_ROLES].reverse().find((d) => roleInt >= d.level) ?? DEFAULT_ROLES[0]).key;

  for (const table of ["workspaceMember", "projectMember"] as const) {
    const members = await db[table].findMany({where: {workspaceId, deletedAt: null, workflowRoleId: null}});
    for (const m of members) {
      await db[table].update({where: {id: m.id}, data: {workflowRoleId: keyToId[pickKey(m.role)]}});
    }
  }

  return keyToId;
}

export function roleCan(role: EffectiveRole, action: EProjectAction): boolean {
  return role.permissions.includes(action);
}
