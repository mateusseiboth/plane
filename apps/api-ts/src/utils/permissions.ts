// Funções configuráveis e matriz de ações (modelo de permissões v2).
//
// FONTE ÚNICA: `ACTION_CATALOG`. Cada ação é UMA linha com chave, rótulo pt-BR,
// grupo da tela, escopo e as funções de sistema que a recebem por padrão. Dela
// saem `EProjectAction`, `ALL_ACTIONS`, `DEFAULT_ROLES`, o catálogo que a tela de
// Funções desenha (`GET /roles/actions/`) e as ações novas que entram nas funções
// já gravadas no boot (`mergeNewActions`). Como adicionar uma ação:
// `.claude/permissoes-v2.md`.
//
// Isto é só o PADRÃO. A configuração viva mora em `workflow_roles.permissions`
// (editável pela tela) e nas exceções por pessoa de `workspace_members`
// (`granted_actions` / `revoked_actions`). A checagem em runtime fica em
// `utils/permission-checks.ts`; este módulo não importa o `@db` para que os
// scripts de seed e o chat (nos testes) possam importá-lo.
//
// Visibilidade: NÃO existe recorte por papel. Quem participa do projeto vê todos
// os chamados; o que a função controla é o que a pessoa pode FAZER e MOVER.

/** Funções de sistema. O admin recebe TODA ação, sem precisar ser citado. */
export type SystemRoleKey = "guest" | "atendimento" | "qualidade" | "ti" | "member" | "gestor_projeto" | "admin";

export type ActionScope = "project" | "workspace";

export type ActionDef = {
  key: string;
  label: string;
  group: string;
  /** `project`: lida da associação ao sistema; `workspace`: da associação ao espaço. */
  scope: ActionScope;
  /** Funções de sistema que recebem a ação por padrão (o admin sempre recebe). */
  roles: readonly Exclude<SystemRoleKey, "admin">[];
};

const TODOS = ["guest", "atendimento", "qualidade", "ti", "member", "gestor_projeto"] as const;
const OPERAM = ["atendimento", "qualidade", "ti", "member", "gestor_projeto"] as const;
const ESCREVEM = ["qualidade", "ti", "member", "gestor_projeto"] as const;
const MEMBRO_E_GESTOR = ["member", "gestor_projeto"] as const;
const GESTOR = ["gestor_projeto"] as const;
const SO_ADMIN = [] as const;

const G = {
  CHAMADOS: "Chamados",
  RESPONSAVEIS: "Responsáveis, etapas e prioridade",
  COMENTARIOS: "Comentários",
  ANEXOS: "Anexos",
  SOLICITACOES: "Solicitações",
  ORGANIZACAO: "Organização do trabalho",
  SISTEMA: "Administração do sistema",
  CHAT: "Atendimento (chat)",
  ESPACO: "Espaço de trabalho",
  CADASTROS: "Cadastros e integrações",
} as const;

// UMA LINHA POR AÇÃO. A ordem é a ordem em que a tela de Funções desenha.
export const ACTION_CATALOG = {
  ISSUE_VIEW: {key: "issue.view", label: "Visualizar chamados", group: G.CHAMADOS, scope: "project", roles: TODOS},
  ISSUE_CREATE: {key: "issue.create", label: "Criar chamados", group: G.CHAMADOS, scope: "project", roles: ESCREVEM},
  ISSUE_EDIT_OWN: {key: "issue.edit.own", label: "Editar os próprios chamados", group: G.CHAMADOS, scope: "project", roles: ESCREVEM},
  ISSUE_EDIT_ALL: {key: "issue.edit.all", label: "Editar qualquer chamado", group: G.CHAMADOS, scope: "project", roles: ESCREVEM},
  ISSUE_DELETE_OWN: {key: "issue.delete.own", label: "Excluir os próprios chamados", group: G.CHAMADOS, scope: "project", roles: MEMBRO_E_GESTOR},
  ISSUE_DELETE_ALL: {key: "issue.delete.all", label: "Excluir qualquer chamado", group: G.CHAMADOS, scope: "project", roles: GESTOR},
  ISSUE_ASSIGN_SELF: {key: "issue.assign.self", label: "Atribuir-se a um chamado", group: G.RESPONSAVEIS, scope: "project", roles: ESCREVEM},
  ISSUE_ASSIGN_OTHERS: {key: "issue.assign.others", label: "Atribuir outros usuários", group: G.RESPONSAVEIS, scope: "project", roles: ["ti", "member", "gestor_projeto"]},
  STATE_MOVE_UNRESTRICTED: {key: "state.unrestricted", label: "Mover para qualquer etapa", group: G.RESPONSAVEIS, scope: "project", roles: GESTOR},
  ISSUE_PRIORITY: {key: "issue.priority", label: "Alterar a prioridade do chamado", group: G.RESPONSAVEIS, scope: "project", roles: GESTOR},
  COMMENT_READ: {key: "comment.read", label: "Ler comentários", group: G.COMENTARIOS, scope: "project", roles: TODOS},
  COMMENT_CREATE: {key: "comment.create", label: "Comentar", group: G.COMENTARIOS, scope: "project", roles: OPERAM},
  COMMENT_EDIT_OWN: {key: "comment.edit.own", label: "Editar os próprios comentários", group: G.COMENTARIOS, scope: "project", roles: OPERAM},
  COMMENT_DELETE_OWN: {key: "comment.delete.own", label: "Excluir os próprios comentários", group: G.COMENTARIOS, scope: "project", roles: OPERAM},
  COMMENT_DELETE_ALL: {key: "comment.delete.all", label: "Excluir comentários de outros", group: G.COMENTARIOS, scope: "project", roles: GESTOR},
  ATTACHMENT_VIEW: {key: "attachment.view", label: "Visualizar anexos", group: G.ANEXOS, scope: "project", roles: TODOS},
  ATTACHMENT_UPLOAD: {key: "attachment.upload", label: "Enviar anexos", group: G.ANEXOS, scope: "project", roles: OPERAM},
  ATTACHMENT_DELETE_OWN: {key: "attachment.delete.own", label: "Remover os próprios anexos", group: G.ANEXOS, scope: "project", roles: OPERAM},
  ATTACHMENT_DELETE_ALL: {key: "attachment.delete.all", label: "Remover qualquer anexo", group: G.ANEXOS, scope: "project", roles: GESTOR},
  INTAKE_CREATE: {key: "intake.create", label: "Abrir pedido de chamado", group: G.SOLICITACOES, scope: "project", roles: OPERAM},
  INTAKE_REVIEW: {key: "intake.review", label: "Triar pedidos (aceitar ou recusar)", group: G.SOLICITACOES, scope: "project", roles: ["qualidade", "member", "gestor_projeto"]},
  CYCLE_MANAGE: {key: "cycle.manage", label: "Gerenciar ciclos", group: G.ORGANIZACAO, scope: "project", roles: ["ti", "member", "gestor_projeto"]},
  MODULE_MANAGE: {key: "module.manage", label: "Gerenciar módulos", group: G.ORGANIZACAO, scope: "project", roles: ["ti", "member", "gestor_projeto"]},
  LABEL_MANAGE: {key: "label.manage", label: "Gerenciar etiquetas", group: G.ORGANIZACAO, scope: "project", roles: MEMBRO_E_GESTOR},
  ESTIMATE_MANAGE: {key: "estimate.manage", label: "Gerenciar estimativas", group: G.ORGANIZACAO, scope: "project", roles: MEMBRO_E_GESTOR},
  VIEW_CREATE: {key: "view.create", label: "Criar visualizações salvas", group: G.ORGANIZACAO, scope: "project", roles: ESCREVEM},
  PAGE_CREATE: {key: "page.create", label: "Criar páginas", group: G.ORGANIZACAO, scope: "project", roles: MEMBRO_E_GESTOR},
  MEMBER_MANAGE: {key: "member.manage", label: "Gerenciar membros do sistema", group: G.SISTEMA, scope: "project", roles: GESTOR},
  STATE_MANAGE: {key: "state.manage", label: "Gerenciar etapas do sistema", group: G.SISTEMA, scope: "project", roles: MEMBRO_E_GESTOR},
  STATE_DELETE: {key: "state.delete", label: "Excluir etapas do sistema", group: G.SISTEMA, scope: "project", roles: SO_ADMIN},
  PROJECT_SETTINGS: {key: "project.settings", label: "Configurações do sistema", group: G.SISTEMA, scope: "project", roles: MEMBRO_E_GESTOR},
  PROJECT_DELETE: {key: "project.delete", label: "Excluir o sistema", group: G.SISTEMA, scope: "project", roles: SO_ADMIN},
  CHAT_ATENDER: {key: "chat.atender", label: "Atender no chat", group: G.CHAT, scope: "workspace", roles: OPERAM},
  CHAT_GERENCIAR: {key: "chat.gerenciar", label: "Transferir atendimentos e ver relatórios do chat", group: G.CHAT, scope: "workspace", roles: MEMBRO_E_GESTOR},
  CHAT_ADMINISTRAR: {key: "chat.administrar", label: "Ver fila, robô e avaliações e configurar o chat", group: G.CHAT, scope: "workspace", roles: SO_ADMIN},
  PROJECT_CREATE: {key: "project.create", label: "Criar sistemas", group: G.ESPACO, scope: "workspace", roles: GESTOR},
  REPORT_VIEW: {key: "report.view", label: "Ver relatórios e análises", group: G.ESPACO, scope: "workspace", roles: MEMBRO_E_GESTOR},
  WORKSPACE_INVITE: {key: "workspace.invite", label: "Convidar pessoas", group: G.ESPACO, scope: "workspace", roles: MEMBRO_E_GESTOR},
  WORKSPACE_MEMBERS: {key: "workspace.members", label: "Gerenciar membros do espaço", group: G.ESPACO, scope: "workspace", roles: SO_ADMIN},
  ROLE_MANAGE: {key: "role.manage", label: "Gerenciar funções e permissões", group: G.ESPACO, scope: "workspace", roles: GESTOR},
  WORKSPACE_SETTINGS: {key: "workspace.settings", label: "Configurar o espaço de trabalho", group: G.ESPACO, scope: "workspace", roles: SO_ADMIN},
  AUDIT_VIEW: {key: "audit.view", label: "Consultar a auditoria", group: G.ESPACO, scope: "workspace", roles: SO_ADMIN},
  PAGE_MANAGE_ALL: {key: "page.manage.all", label: "Travar, arquivar e excluir páginas de outros", group: G.ESPACO, scope: "workspace", roles: SO_ADMIN},
  LABEL_SLA: {key: "label.sla", label: "Configurar o prazo das etiquetas", group: G.ESPACO, scope: "workspace", roles: GESTOR},
  ENTITY_MANAGE: {key: "entity.manage", label: "Cadastrar entidades", group: G.CADASTROS, scope: "workspace", roles: MEMBRO_E_GESTOR},
  VISIT_MANAGE: {key: "visit.manage", label: "Registrar visitas técnicas", group: G.CADASTROS, scope: "workspace", roles: OPERAM},
  VISIT_MANAGE_ALL: {key: "visit.manage.all", label: "Trocar técnico e data, cancelar e editar qualquer visita técnica", group: G.CADASTROS, scope: "workspace", roles: GESTOR},
  ISSUE_TYPE_MANAGE: {key: "issue.type.manage", label: "Gerenciar tipos e propriedades de chamado", group: G.CADASTROS, scope: "workspace", roles: MEMBRO_E_GESTOR},
  IMPORT_MANAGE: {key: "import.manage", label: "Importar dados", group: G.CADASTROS, scope: "workspace", roles: MEMBRO_E_GESTOR},
  INTEGRATION_MANAGE: {key: "integration.manage", label: "Gerenciar integrações e webhooks", group: G.CADASTROS, scope: "workspace", roles: MEMBRO_E_GESTOR},
  AI_CONFIG: {key: "ai.config", label: "Configurar provedores de IA", group: G.CADASTROS, scope: "workspace", roles: MEMBRO_E_GESTOR},
  PLUGIN_MANAGE: {key: "plugin.manage", label: "Instalar e remover plugins", group: G.CADASTROS, scope: "workspace", roles: SO_ADMIN},
  PORTAL_MANAGE: {key: "portal.manage", label: "Gerenciar contas do portal do cliente", group: G.CADASTROS, scope: "workspace", roles: SO_ADMIN},
} as const satisfies Record<string, ActionDef>;

type Catalog = typeof ACTION_CATALOG;

/** Nome de cada ação no código (`EProjectAction.ISSUE_VIEW` → `"issue.view"`). */
export const EProjectAction = Object.fromEntries(
  Object.entries(ACTION_CATALOG).map(([nome, def]) => [nome, def.key]),
) as {readonly [K in keyof Catalog]: Catalog[K]["key"]};
export type EProjectAction = Catalog[keyof Catalog]["key"];

export const ALL_ACTIONS: EProjectAction[] = Object.values(ACTION_CATALOG).map((a) => a.key);

const ACTION_KEYS = new Set<string>(ALL_ACTIONS);

export const isKnownAction = (key: unknown): key is EProjectAction => typeof key === "string" && ACTION_KEYS.has(key);

/**
 * Ações cuja distribuição padrão já valia antes do catálogo (as 28 originais,
 * menos `state.manage` e `project.settings`, que passaram a chegar ao Membro).
 * Função gravada sem `known_actions` é tratada como quem já conhecia estas:
 * o que o admin tirou dela não volta; o resto entra uma vez.
 */
export const BASELINE_KNOWN_ACTIONS: string[] = [
  "issue.view", "comment.read", "attachment.view", "issue.create", "issue.edit.own", "issue.edit.all",
  "issue.delete.own", "issue.delete.all", "issue.assign.self", "issue.assign.others", "state.unrestricted",
  "comment.create", "comment.edit.own", "comment.delete.own", "comment.delete.all", "attachment.upload",
  "attachment.delete.own", "attachment.delete.all", "intake.create", "intake.review", "cycle.manage",
  "module.manage", "label.manage", "view.create", "page.create", "member.manage",
];

export type DefaultRole = {
  key: SystemRoleKey;
  name: string;
  level: number; // espelha o `role` Int legado (EUserPermissions)
  permissions: EProjectAction[];
};

const actionsOfRole = (key: SystemRoleKey): EProjectAction[] =>
  key === "admin"
    ? [...ALL_ACTIONS]
    : Object.values(ACTION_CATALOG)
        .filter((a) => (a.roles as readonly string[]).includes(key))
        .map((a) => a.key);

// 7 funções de sistema. `member` fica em 15 (espelha EUserPermissions.MEMBER):
// com 10 nenhuma associação role=15 casava e o workflow inteiro era burlado.
export const DEFAULT_ROLES: DefaultRole[] = (
  [
    ["guest", "Visualizador", 5],
    ["atendimento", "Atendimento", 6],
    ["qualidade", "Qualidade", 8],
    ["member", "Membro", 15],
    ["ti", "TI", 12],
    ["gestor_projeto", "Gestor de Projeto", 18],
    ["admin", "Administrador", 20],
  ] as const
).map(([key, name, level]) => ({key, name, level, permissions: actionsOfRole(key)}));

const asStringList = (raw: unknown): string[] => (Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : []);

/**
 * Permissões efetivas de uma pessoa: as da função, mais o que foi concedido a
 * ela, menos o que foi negado. A negação vence. Chave fora do catálogo some.
 */
export function applyMemberOverrides(rolePermissions: readonly string[], overrides: {granted: unknown; revoked: unknown}): string[] {
  const negadas = new Set(asStringList(overrides.revoked));
  const somadas = [...rolePermissions, ...asStringList(overrides.granted)].filter(isKnownAction);
  return [...new Set(somadas)].filter((a) => !negadas.has(a));
}

/**
 * Leva ações NOVAS do catálogo a uma função já gravada sem desfazer o que o admin
 * editou: só entra o que a função ainda não conhecia e está no seu padrão.
 */
export function mergeNewActions(
  role: {permissions: unknown; knownActions: unknown},
  defaults: readonly string[],
): {permissions: string[]; knownActions: string[]} {
  const conhecidas = new Set(role.knownActions == null ? BASELINE_KNOWN_ACTIONS : asStringList(role.knownActions));
  const atuais = asStringList(role.permissions);
  const novas = defaults.filter((a) => !conhecidas.has(a) && !atuais.includes(a));
  return {permissions: [...atuais, ...novas], knownActions: [...ALL_ACTIONS]};
}

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
    // Concluir é da Qualidade: o TI entrega em "Em Teste" e para por aí. A
    // linha "Em Teste → concluído" existia aqui e deixava o TI fechar o próprio
    // trabalho, que é justamente o que a separação de setores quer evitar.
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
 * O que sincronizar numa função de sistema já gravada, a cada boot.
 *
 * `level` é estrutural (resolveRole casa o `role` Int da associação por ele) e
 * sempre volta ao padrão. Permissões são do admin: só recebem as ações NOVAS do
 * catálogo (`mergeNewActions`), a não ser que RESEED_WORKFLOW=true force o padrão
 * do código de volta.
 */
function buildSystemRoleSync(role: {permissions: unknown; knownActions?: unknown}, def: DefaultRole, reseed: boolean) {
  const merged = mergeNewActions({permissions: role.permissions, knownActions: role.knownActions ?? null}, def.permissions);
  return {
    level: def.level,
    permissions: reseed ? def.permissions : merged.permissions,
    knownActions: merged.knownActions,
  };
}

/**
 * Idempotently seed the 7 system roles + default visibility/transition rules for
 * a workspace, then link any members that don't yet have a workflowRole (by
 * mapping their legacy role Int to the closest system role level).
 * Accepts a PrismaClient instance so it works from seed.ts and the migration.
 */
export async function seedWorkflowRoles(db: any, workspaceId: string): Promise<Record<string, string>> {
  const keyToId: Record<string, string> = {};
  const reseed = process.env.RESEED_WORKFLOW === "true";
  for (const def of DEFAULT_ROLES) {
    let role = await db.workflowRole.findFirst({where: {workspaceId, key: def.key, deletedAt: null}});
    if (!role) {
      role = await db.workflowRole.create({
        data: {
          workspaceId,
          key: def.key,
          name: def.name,
          level: def.level,
          isSystem: true,
          permissions: def.permissions,
          knownActions: ALL_ACTIONS,
        },
      });
    } else if (role.isSystem) {
      role = await db.workflowRole.update({where: {id: role.id}, data: buildSystemRoleSync(role, def, reseed)});
    }
    keyToId[def.key] = role.id;
  }

  // By default we only seed transition rows for a role that has none,
  // so admin edits made through the roles API survive restarts. Set
  // RESEED_WORKFLOW=true to force the code defaults back onto the system roles
  // (use after changing DEFAULT_TRANSITIONS).
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

/**
 * Deixa os vínculos de projeto de um membro coerentes com a função que ele tem
 * no espaço de trabalho.
 *
 * São DUAS colunas, e as duas importam: `role` (o nível) e `workflowRoleId` (o
 * vínculo explícito com a função configurável). Quem decide é o vínculo — ele
 * tem prioridade em `resolveRole` —, então mexer só no nível não muda nada na
 * prática. Era esse o buraco: pessoas marcadas como TI seguiam apontando para
 * "Gestor de Projeto" e por isso concluíam chamado e devolviam para a Triagem.
 */
export async function syncFuncaoNosProjetos(
  db: {
    workflowRole: {findFirst: (args: any) => Promise<any>};
    projectMember: {updateMany: (args: any) => Promise<any>};
  },
  workspaceId: string,
  memberId: string,
  level: number,
): Promise<void> {
  const funcao = await db.workflowRole.findFirst({where: {workspaceId, level, deletedAt: null}});
  await db.projectMember.updateMany({
    where: {workspaceId, memberId, deletedAt: null},
    data: {role: level, ...(funcao && {workflowRoleId: funcao.id})},
  });
}
