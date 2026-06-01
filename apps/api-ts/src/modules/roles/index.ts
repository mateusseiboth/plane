// Configurable roles / workflow management API (H5). Admin-only.
// CRUD for WorkflowRole plus its board-visibility and state-transition matrices,
// and a catalogue of available actions for the settings UI.
import Elysia from "elysia";
import {authPlugin} from "@middleware/auth";
import prisma from "@db";
import {getWorkspaceOrFail, requireWorkspaceMember} from "@utils/workspace";
import {ALL_ACTIONS} from "@utils/permissions";

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
    visibility: (r.visibility ?? []).map((v: any) => ({
      id: v.id,
      group: v.group,
      state_name: v.stateName,
      can_view: v.canView,
    })),
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

// Admins (role >= 18) manage roles.
async function requireRoleAdmin(workspaceId: string, userId: string) {
  const m = await requireWorkspaceMember(workspaceId, userId);
  if (m.role < 18) throw {status: 403, message: "Apenas administradores podem gerenciar funções."};
  return m;
}

export const rolesModule = new Elysia({prefix: "/workspaces/:slug/roles"})
  .use(authPlugin)

  // Action catalogue for the settings UI
  .get("/actions/", async ({params: {slug}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return ALL_ACTIONS.map((key) => ({key}));
  })

  .get("/", async ({params: {slug}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const roles = await prisma.workflowRole.findMany({
      where: {workspaceId: ws.id, deletedAt: null},
      include: {visibility: true, transitions: true},
      orderBy: {level: "asc"},
    });
    return roles.map(roleDto);
  })

  .post("/", async ({params: {slug}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireRoleAdmin(ws.id, user.id);
    const b = body as any;
    if (!b.name) {
      set.status = 400;
      return {detail: "Name is required."};
    }
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
        permissions: Array.isArray(b.permissions) ? b.permissions : [],
      },
      include: {visibility: true, transitions: true},
    });
    set.status = 201;
    return roleDto(role);
  })

  .get("/:role_id/", async ({params: {slug, role_id}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const role = await prisma.workflowRole.findFirst({
      where: {id: role_id, workspaceId: ws.id, deletedAt: null},
      include: {visibility: true, transitions: true},
    });
    if (!role) {
      set.status = 404;
      return {detail: "Função não encontrada."};
    }
    return roleDto(role);
  })

  .patch("/:role_id/", async ({params: {slug, role_id}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireRoleAdmin(ws.id, user.id);
    const b = body as any;
    const data: any = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.level !== undefined) data.level = b.level;
    if (Array.isArray(b.permissions)) data.permissions = b.permissions;
    const role = await prisma.workflowRole.update({
      where: {id: role_id},
      data,
      include: {visibility: true, transitions: true},
    });
    return roleDto(role);
  })

  .delete("/:role_id/", async ({params: {slug, role_id}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireRoleAdmin(ws.id, user.id);
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

  // Replace the full visibility matrix for a role
  .put("/:role_id/visibility/", async ({params: {slug, role_id}, body, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireRoleAdmin(ws.id, user.id);
    const rows: any[] = (body as any)?.visibility ?? [];
    await prisma.$transaction([
      prisma.roleStateVisibility.deleteMany({where: {roleId: role_id}}),
      prisma.roleStateVisibility.createMany({
        data: rows.map((r) => ({
          roleId: role_id,
          workspaceId: ws.id,
          group: r.group,
          stateName: r.state_name ?? null,
          canView: r.can_view ?? true,
        })),
      }),
    ]);
    const role = await prisma.workflowRole.findFirst({where: {id: role_id}, include: {visibility: true, transitions: true}});
    return roleDto(role);
  })

  // Replace the full transition matrix for a role
  .put("/:role_id/transitions/", async ({params: {slug, role_id}, body, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireRoleAdmin(ws.id, user.id);
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
    const role = await prisma.workflowRole.findFirst({where: {id: role_id}, include: {visibility: true, transitions: true}});
    return roleDto(role);
  });
