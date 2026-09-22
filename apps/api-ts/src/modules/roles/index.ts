// API das funções configuráveis e da matriz de ações (permissões v2).
// CRUD de WorkflowRole + matriz de transições, catálogo de ações para a tela,
// as ações efetivas de quem chama e as exceções por pessoa. Quem edita precisa
// de `role.manage`. Ver .claude/permissoes-v2.md.
import Elysia from "elysia";
import {authPlugin} from "@middleware/auth";
import prisma from "@db";
import {getWorkspaceOrFail, requireWorkspaceMember} from "@utils/workspace";
import {ACTION_CATALOG, ALL_ACTIONS, applyMemberOverrides} from "@utils/permissions";
import {EProjectAction, listMemberActions, requireWorkspaceAction, resolveRole} from "@utils/permission-checks";
import {findActionErrors} from "@modules/roles/validar-acoes";

function slugify(name: string) {
  return name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function roleDto(r: any) {
  return {
    id: r.id,
    name: r.name,
    key: r.key,
    level: r.level,
    is_system: r.isSystem,
    permissions: (r.permissions as string[]) ?? [],
    workspace_id: r.workspaceId,
    transitions: (r.transitions ?? []).map((t: any) => ({
      id: t.id,
      from_group: t.fromGroup,
      from_state_name: t.fromStateName,
      to_group: t.toGroup,
      to_state_name: t.toStateName,
      allowed: t.allowed,
    })),
  };
}

const ACTIONS_DTO = Object.values(ACTION_CATALOG).map(({key, label, group, scope}) => ({key, label, group, scope}));

/** Guarda das escritas: exige `role.manage` e devolve o que quem edita pode conceder. */
async function requireRoleManager(workspaceId: string, userId: string): Promise<string[]> {
  const role = await requireWorkspaceAction(workspaceId, userId, EProjectAction.ROLE_MANAGE);
  return role.permissions;
}

const invalidBody = (set: {status?: number | string}, errors: {path: string; message: string}[]) => {
  set.status = 400;
  return {detail: "Revise as permissões marcadas.", errors};
};

async function memberOverridesDto(workspaceId: string, m: any) {
  const role = await resolveRole(workspaceId, m.role, m.workflowRoleId);
  return {
    member_id: m.memberId,
    display_name: m.member?.displayName ?? "",
    email: m.member?.email ?? "",
    role_id: role.id,
    role_key: role.key,
    role_name: m.workflowRole?.name ?? role.key,
    role_level: role.level,
    granted: applyMemberOverrides([], {granted: m.grantedActions, revoked: []}),
    revoked: applyMemberOverrides([], {granted: m.revokedActions, revoked: []}),
  };
}

const MEMBER_INCLUDE = {
  member: {select: {displayName: true, email: true}},
  workflowRole: {select: {name: true}},
} as const;

export const rolesModule = new Elysia({prefix: "/workspaces/:slug/roles"})
  .use(authPlugin)

  // Catálogo de ações para a tela de Funções: chave, rótulo, grupo e escopo.
  .get("/actions/", async ({params: {slug}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return ACTIONS_DTO;
  })

  // O que quem chama pode fazer no espaço (função + exceções por pessoa).
  .get("/me/", async ({params: {slug}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    const r = await listMemberActions(ws.id, user.id);
    return {
      role: {id: r.role.id, key: r.role.key, level: r.role.level},
      permissions: r.permissions,
      granted: r.granted,
      revoked: r.revoked,
    };
  })

  // Exceções por pessoa, para a tela de Funções.
  .get("/members/", async ({params: {slug}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireRoleManager(ws.id, user.id);
    const members = await prisma.workspaceMember.findMany({
      where: {workspaceId: ws.id, isActive: true, deletedAt: null},
      include: MEMBER_INCLUDE,
      orderBy: {createdAt: "asc"},
    });
    return Promise.all(members.map((m) => memberOverridesDto(ws.id, m)));
  })

  .put("/members/:member_id/", async ({params: {slug, member_id}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    const podeConceder = await requireRoleManager(ws.id, user.id);
    if (member_id === user.id) {
      set.status = 403;
      return {detail: "Peça a outra pessoa que gerencia funções para alterar as suas permissões."};
    }
    const b = (body ?? {}) as {granted?: unknown; revoked?: unknown};
    const errors = findActionErrors({granted: b.granted ?? [], revoked: b.revoked ?? []}, podeConceder);
    if (errors.length) return invalidBody(set, errors);
    const alvo = await prisma.workspaceMember.findFirst({
      where: {workspaceId: ws.id, memberId: member_id, isActive: true, deletedAt: null},
    });
    if (!alvo) {
      set.status = 404;
      return {detail: "Pessoa não encontrada neste espaço de trabalho."};
    }
    const atualizado = await prisma.workspaceMember.update({
      where: {id: alvo.id},
      data: {grantedActions: [...new Set(b.granted as string[])], revokedActions: [...new Set(b.revoked as string[])]},
      include: MEMBER_INCLUDE,
    });
    return memberOverridesDto(ws.id, atualizado);
  })

  .get("/", async ({params: {slug}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const roles = await prisma.workflowRole.findMany({
      where: {workspaceId: ws.id, deletedAt: null},
      include: {transitions: true},
      orderBy: {level: "asc"},
    });
    return roles.map(roleDto);
  })

  .post("/", async ({params: {slug}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    const podeConceder = await requireRoleManager(ws.id, user.id);
    const b = body as any;
    if (!b.name) {
      set.status = 400;
      return {detail: "O nome é obrigatório.", errors: [{path: "name", message: "Informe o nome da função."}]};
    }
    const permissions = Array.isArray(b.permissions) ? b.permissions : [];
    const errors = findActionErrors({permissions}, podeConceder);
    if (errors.length) return invalidBody(set, errors);
    const key = b.key ? slugify(b.key) : slugify(b.name);
    const exists = await prisma.workflowRole.findFirst({where: {workspaceId: ws.id, key, deletedAt: null}});
    if (exists) {
      set.status = 409;
      return {detail: "Já existe uma função com essa chave.", id: exists.id};
    }
    const role = await prisma.workflowRole.create({
      data: {
        workspaceId: ws.id,
        name: b.name,
        key,
        level: typeof b.level === "number" ? b.level : 10,
        isSystem: false,
        permissions,
        knownActions: ALL_ACTIONS,
      },
      include: {transitions: true},
    });
    set.status = 201;
    return roleDto(role);
  })

  .get("/:role_id/", async ({params: {slug, role_id}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const role = await prisma.workflowRole.findFirst({
      where: {id: role_id, workspaceId: ws.id, deletedAt: null},
      include: {transitions: true},
    });
    if (!role) {
      set.status = 404;
      return {detail: "Função não encontrada."};
    }
    return roleDto(role);
  })

  .patch("/:role_id/", async ({params: {slug, role_id}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    const podeConceder = await requireRoleManager(ws.id, user.id);
    const b = body as any;
    // Scope by workspace: a role id from another tenant must never be writable.
    const target = await prisma.workflowRole.findFirst({where: {id: role_id, workspaceId: ws.id, deletedAt: null}});
    if (!target) {
      set.status = 404;
      return {detail: "Função não encontrada."};
    }
    // Só as ações ACRESCENTADAS passam pela trava de "não concede o que não tem":
    // quem gerencia funções pode salvar uma função que já tinha mais do que ele.
    const atuais = new Set((target.permissions as string[]) ?? []);
    const acrescentadas = Array.isArray(b.permissions) ? b.permissions.filter((p: string) => !atuais.has(p)) : undefined;
    const errors = [
      ...findActionErrors({permissions: b.permissions}, ALL_ACTIONS),
      ...findActionErrors({permissions: acrescentadas}, podeConceder),
    ];
    if (errors.length) return invalidBody(set, errors);
    const data: any = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.level !== undefined) data.level = b.level;
    if (Array.isArray(b.permissions)) {
      data.permissions = [...new Set(b.permissions)];
      data.knownActions = ALL_ACTIONS;
    }
    const role = await prisma.workflowRole.update({
      where: {id: role_id},
      data,
      include: {transitions: true},
    });
    return roleDto(role);
  })

  .delete("/:role_id/", async ({params: {slug, role_id}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireRoleManager(ws.id, user.id);
    const role = await prisma.workflowRole.findFirst({where: {id: role_id, workspaceId: ws.id, deletedAt: null}});
    if (!role) {
      set.status = 404;
      return {detail: "Função não encontrada."};
    }
    if (role.isSystem) {
      set.status = 400;
      return {detail: "Funções do sistema não podem ser excluídas."};
    }
    await prisma.workflowRole.update({where: {id: role_id}, data: {deletedAt: new Date()}});
    set.status = 204;
    return null;
  })

  // Replace the full transition matrix for a role
  .put("/:role_id/transitions/", async ({params: {slug, role_id}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireRoleManager(ws.id, user.id);
    const target = await prisma.workflowRole.findFirst({where: {id: role_id, workspaceId: ws.id, deletedAt: null}});
    if (!target) {
      set.status = 404;
      return {detail: "Função não encontrada."};
    }
    const rows: any[] = (body as any)?.transitions ?? [];
    await prisma.$transaction([
      prisma.roleStateTransition.deleteMany({where: {roleId: role_id}}),
      prisma.roleStateTransition.createMany({
        data: rows.map((r) => ({
          roleId: role_id,
          workspaceId: ws.id,
          fromGroup: r.from_group,
          fromStateName: r.from_state_name ?? null,
          toGroup: r.to_group,
          toStateName: r.to_state_name ?? null,
          allowed: r.allowed ?? true,
        })),
      }),
    ]);
    const role = await prisma.workflowRole.findFirst({where: {id: role_id}, include: {transitions: true}});
    return roleDto(role);
  });
