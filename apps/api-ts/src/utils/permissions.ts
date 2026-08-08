// Configurable roles / workflow (H1–H3).
//
// The action catalogue mirrors packages/constants/src/project-permissions.ts.
// Defaults seed the 7 system roles plus the state-transition matrix. Everything here is just
// the *default*; admins edit the live config (WorkflowRole / RoleStateVisibility
// / RoleStateTransition rows) through the roles API.
//
// Visibilidade: NÃO existe recorte por papel. Quem participa do projeto vê todos
// os chamados, em qualquer etapa; o recorte por setor é feito por FILTRO (há
// templates prontos na UI). O que o papel controla é o que ele pode MOVER.
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

// D2 — Atendimento is a service-desk operator: it opens *chamados* (intake) and
// talks on them, but never creates, edits or moves a work item.
const INTAKE_OPERATOR = [
  ...VIEWER,
  EProjectAction.COMMENT_CREATE,
  EProjectAction.COMMENT_EDIT_OWN,
  EProjectAction.COMMENT_DELETE_OWN,
  EProjectAction.ATTACHMENT_UPLOAD,
  EProjectAction.ATTACHMENT_DELETE_OWN,
  EProjectAction.INTAKE_CREATE,
];

const CONTRIBUTOR = [
  ...INTAKE_OPERATOR,
  EProjectAction.ISSUE_CREATE,
  EProjectAction.ISSUE_EDIT_OWN,
  EProjectAction.ISSUE_ASSIGN_SELF,
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
  {key: "atendimento", name: "Atendimento", level: 6, permissions: [...INTAKE_OPERATOR]},
  {
    key: "qualidade",
    name: "Qualidade",
    level: 8,
    permissions: [...CONTRIBUTOR, EProjectAction.ISSUE_EDIT_ALL, EProjectAction.INTAKE_REVIEW, EProjectAction.VIEW_CREATE],
  },
  {
    key: "member",
    // Must stay 15 — it mirrors EUserPermissions.MEMBER in packages/constants and
    // packages/types. With level 10 no WorkflowRole matched a role=15 membership,
    // so resolveRole() fell through to the TI defaults and canTransition() went
    // permissive (members bypassed the whole workflow).
    name: "Membro",
    level: 15,
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

export type TransitionRule = {fromGroup: string; fromStateName?: string | null; toGroup: string; toStateName?: string | null};

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
    // TI can also park work back in "A Fazer" (own to-do lane) from development.
    {fromGroup: "started", fromStateName: STATE.EM_DESENVOLVIMENTO, toGroup: "unstarted", toStateName: STATE.A_FAZER},
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
 * Papel padrão correspondente a um nível legado (o maior papel cujo `level` não
 * ultrapassa o informado).
 *
 * DEFAULT_ROLES NÃO está ordenado por nível (member=15 aparece antes de ti=12),
 * então varrer a lista invertida devolvia "ti" para uma associação role=15 —
 * membros eram vinculados ao papel de TI no seed e recebiam as permissões de TI
 * em workspaces ainda não semeados. Ordenar por nível decrescente evita depender
 * da ordem de declaração.
 */
export function defaultRoleForLevel(level: number): DefaultRole {
  const byLevelDesc = [...DEFAULT_ROLES].sort((a, b) => b.level - a.level);
  return byLevelDesc.find((d) => level >= d.level) ?? byLevelDesc[byLevelDesc.length - 1];
}

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
    } else if (role.isSystem) {
      // `level` is structural: resolveRole() looks a membership's role Int up by
      // it, so a drifted level silently detaches members from their role — always
      // realign it. Permissions stay admin-editable unless RESEED_WORKFLOW forces
      // the code defaults back (needed after changing DEFAULT_ROLES).
      const data: Record<string, unknown> = {};
      if (role.level !== def.level) data.level = def.level;
      if (process.env.RESEED_WORKFLOW === "true") data.permissions = def.permissions;
      if (Object.keys(data).length) role = await db.workflowRole.update({where: {id: role.id}, data});
    }
    keyToId[def.key] = role.id;
  }

  // By default we only seed transition rows for a role that has none,
  // so admin edits made through the roles API survive restarts. Set
  // RESEED_WORKFLOW=true to force the code defaults back onto the system roles
  // (use after changing DEFAULT_TRANSITIONS).
  const reseed = process.env.RESEED_WORKFLOW === "true";

  for (const [key, rules] of Object.entries(DEFAULT_TRANSITIONS)) {
    const roleId = keyToId[key];
    if (!roleId) continue;
    const count = await db.roleStateTransition.count({where: {roleId}});
    if (count > 0 && !reseed) continue;
    if (count > 0) await db.roleStateTransition.deleteMany({where: {roleId}});
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

  const pickKey = (roleInt: number) => defaultRoleForLevel(roleInt).key;

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
