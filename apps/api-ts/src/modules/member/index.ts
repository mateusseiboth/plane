import prisma from "@db";
import {authPlugin} from "@middleware/auth";
import {getProjectOrFail, getWorkspaceOrFail, requireWorkspaceMember} from "@utils/workspace";
import {EProjectAction, resolveRole, roleCan} from "@utils/permission-checks";
import Elysia from "elysia";

export const memberModule = new Elysia({prefix: "/workspaces/:slug"})
  .use(authPlugin)

  .get("/members/", async ({params: {slug}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    // Esta rota sobrescreve a homônima do workspaceModule. Sem a checagem de
    // associação, qualquer usuário autenticado listava nome e e-mail de TODOS os
    // membros de QUALQUER workspace, bastando conhecer o slug.
    await requireWorkspaceMember(ws.id, user.id);
    // Return only non-guest members (role > 5) or all active members
    // Excludes entity contacts migrated from SAC (role=5, externalSource=sac_migration)
    const members = await prisma.workspaceMember.findMany({
      where: {workspaceId: ws.id, isActive: true, deletedAt: null},
      include: {
        member: {select: {id: true, email: true, displayName: true, avatar: true, avatarUrl: true, firstName: true, lastName: true}},
      },
      orderBy: {createdAt: "asc"},
    });
    return members.map(
      (m: {
        id: string;
        member: {
          id: string;
          email: string | null;
          displayName: string;
          avatar: string | null;
          avatarUrl: string | null;
          firstName: string | null;
          lastName: string | null;
        };
        role: number;
        isActive: boolean;
        createdAt: Date;
      }) => ({
        id: m.id,
        member: {
          id: m.member.id,
          email: m.member.email,
          display_name: m.member.displayName,
          avatar: m.member.avatar,
          avatar_url: m.member.avatarUrl,
          first_name: m.member.firstName,
          last_name: m.member.lastName,
          is_bot: false,
        },
        role: m.role,
        is_active: m.isActive,
        created_at: m.createdAt.toISOString(),
      }),
    );
  })

  .get("/members/me/", async ({params: {slug}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    const m = await prisma.workspaceMember.findFirstOrThrow({
      where: {workspaceId: ws.id, memberId: user.id, deletedAt: null},
    });
    return {
      id: m.id,
      member: user.id,
      role: m.role,
      is_active: m.isActive,
      workspace: ws.id,
      created_at: m.createdAt.toISOString(),
      updated_at: m.updatedAt.toISOString(),
    };
  })

  // Plain array — frontend store expects TProjectMembership[] with member.member access
  .get("/projects/:project_id/members/", async ({params: {slug, project_id}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const members = await prisma.projectMember.findMany({
      where: {projectId: project_id, isActive: true, deletedAt: null},
      include: {
        member: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            displayName: true,
            avatar: true,
            avatarUrl: true,
            isActive: true,
          },
        },
      },
      orderBy: {createdAt: "asc"},
    });
    // Exclude users whose workspace membership is inactive (suspended users)
    const activeWsMembers = await prisma.workspaceMember.findMany({
      where: {workspaceId: ws.id, isActive: true, deletedAt: null},
      select: {memberId: true},
    });
    const activeWsMemberIds = new Set(activeWsMembers.map((m: {memberId: string}) => m.memberId));
    return members
      .filter((m: {member: {isActive?: boolean; id: string}}) => m.member.isActive !== false && activeWsMemberIds.has(m.member.id))
      .map(
        (m: {
          id: string;
          member: {id: string; displayName: string; avatarUrl?: string | null; avatar?: string | null};
          role: number;
          createdAt: Date;
        }) => ({
          id: m.id,
          member: m.member.id,
          member__display_name: m.member.displayName,
          member__avatar_url: m.member.avatarUrl ?? m.member.avatar,
          role: m.role,
          original_role: m.role,
          created_at: m.createdAt.toISOString(),
        }),
      );
  })

  .post("/projects/:project_id/members/", async ({params: {slug, project_id}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    const {member} = await getProjectOrFail(ws.id, project_id, user.id, {allowInstanceAdmin: true});
    // Managing project members is a project-role capability (MEMBER_MANAGE), not an
    // instance-admin one: a workspace admin or Gestor de Projeto must be able to do it.
    const role = await resolveRole(ws.id, member.role, (member as any).workflowRoleId);
    if (!roleCan(role, EProjectAction.MEMBER_MANAGE)) {
      set.status = 403;
      return {detail: "Apenas administradores ou gestores de projeto podem adicionar membros."};
    }
    const b = body as any;
    const m = await prisma.projectMember.create({
      data: {projectId: project_id, workspaceId: ws.id, memberId: b.member_id, role: b.role ?? 5, isActive: true},
    });
    set.status = 201;
    return {id: m.id, member: m.memberId, role: m.role, original_role: m.role};
  })

  .patch("/projects/:project_id/members/:pk/", async ({params: {slug, project_id, pk}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    const {member} = await getProjectOrFail(ws.id, project_id, user.id, {allowInstanceAdmin: true});
    // Managing project members is a project-role capability (MEMBER_MANAGE), not an
    // instance-admin one: a workspace admin or Gestor de Projeto must be able to do it.
    const role = await resolveRole(ws.id, member.role, (member as any).workflowRoleId);
    if (!roleCan(role, EProjectAction.MEMBER_MANAGE)) {
      set.status = 403;
      return {detail: "Apenas administradores ou gestores de projeto podem atualizar funções de membros."};
    }
    const m = await prisma.projectMember.update({where: {id: pk}, data: {role: (body as any).role}});
    return {id: m.id, member: m.memberId, role: m.role, original_role: m.role};
  })

  .delete("/projects/:project_id/members/:pk/", async ({params: {slug, project_id, pk}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    const {member} = await getProjectOrFail(ws.id, project_id, user.id, {allowInstanceAdmin: true});
    // Managing project members is a project-role capability (MEMBER_MANAGE), not an
    // instance-admin one: a workspace admin or Gestor de Projeto must be able to do it.
    const role = await resolveRole(ws.id, member.role, (member as any).workflowRoleId);
    if (!roleCan(role, EProjectAction.MEMBER_MANAGE)) {
      set.status = 403;
      return {detail: "Apenas administradores ou gestores de projeto podem remover membros."};
    }
    await prisma.projectMember.update({where: {id: pk}, data: {deletedAt: new Date(), isActive: false}});
    set.status = 204;
    return null;
  });
