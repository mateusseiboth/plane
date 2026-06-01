import prisma from "@db";

export async function getWorkspaceOrFail(slug: string) {
  const ws = await prisma.workspace.findFirst({where: {slug, deletedAt: null}});
  if (!ws) throw {status: 404, message: "Workspace not found."};
  return ws;
}

export async function isWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
  return !!(await prisma.workspaceMember.findFirst({
    where: {workspaceId, memberId: userId, isActive: true, deletedAt: null},
  }));
}

export async function requireWorkspaceMember(workspaceId: string, userId: string) {
  const m = await prisma.workspaceMember.findFirst({
    where: {workspaceId, memberId: userId, isActive: true, deletedAt: null},
  });
  if (!m) throw {status: 403, message: "You do not have permission to perform this action."};
  return m;
}

export async function requireWorkspaceWriter(workspaceId: string, userId: string) {
  const m = await requireWorkspaceMember(workspaceId, userId);
  if (m.role < 15) throw {status: 403, message: "You do not have permission to perform this action."};
  return m;
}

export async function getProjectOrFail(workspaceId: string, projectId: string, userId: string, options?: {allowInstanceAdmin?: boolean}) {
  const project = await prisma.project.findFirst({
    where: {id: projectId, workspaceId, deletedAt: null},
  });
  if (!project) throw {status: 404, message: "Project not found."};

  let member = await prisma.projectMember.findFirst({
    where: {projectId, memberId: userId, isActive: true, deletedAt: null},
  });

  // Workspace admins have full access to every project. This must hold even when
  // a lower-privilege project membership row exists (e.g. migrations that added
  // the admin to projects at role 15) — otherwise admins get spurious 403s on
  // role-gated actions like state transitions. Elevate the effective role to 20.
  const wsAdmin = await prisma.workspaceMember.findFirst({
    where: {workspaceId, memberId: userId, role: {gte: 20}, isActive: true, deletedAt: null},
  });
  if (wsAdmin) {
    if (member) {
      member = {...member, role: Math.max(member.role, 20)} as any;
    } else {
      // Return a synthetic member record granting admin-level access
      member = {
        id: `ws-admin-${userId}`,
        projectId,
        workspaceId,
        memberId: userId,
        role: 20,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        sortOrder: null as any,
      } as any;
    }
  }

  if (!member && options?.allowInstanceAdmin) {
    const instanceAdmin = await prisma.user.findFirst({
      where: {id: userId, isActive: true, deletedAt: null, isInstanceAdmin: true},
      select: {id: true},
    });
    if (instanceAdmin) {
      member = {
        id: `instance-admin-${userId}`,
        projectId,
        workspaceId,
        memberId: userId,
        role: 20,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        sortOrder: null as any,
      } as any;
    }
  }

  if (!member) throw {status: 403, message: "You are not a member of this project."};

  return {project, member};
}
