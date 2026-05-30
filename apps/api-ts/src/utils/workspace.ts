import prisma from "@db";

export async function getWorkspaceOrFail(slug: string) {
  const ws = await prisma.workspace.findFirst({ where: { slug, deletedAt: null } });
  if (!ws) throw { status: 404, message: "Workspace not found." };
  return ws;
}

export async function isWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
  return !!(await prisma.workspaceMember.findFirst({
    where: { workspaceId, memberId: userId, isActive: true, deletedAt: null },
  }));
}

export async function requireWorkspaceMember(workspaceId: string, userId: string) {
  const m = await prisma.workspaceMember.findFirst({
    where: { workspaceId, memberId: userId, isActive: true, deletedAt: null },
  });
  if (!m) throw { status: 403, message: "You do not have permission to perform this action." };
  return m;
}

export async function requireWorkspaceWriter(workspaceId: string, userId: string) {
  const m = await requireWorkspaceMember(workspaceId, userId);
  if (m.role < 15) throw { status: 403, message: "You do not have permission to perform this action." };
  return m;
}

export async function getProjectOrFail(workspaceId: string, projectId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId, deletedAt: null },
  });
  if (!project) throw { status: 404, message: "Project not found." };

  const member = await prisma.projectMember.findFirst({
    where: { projectId, memberId: userId, isActive: true, deletedAt: null },
  });
  if (!member) throw { status: 403, message: "You are not a member of this project." };

  return { project, member };
}
