import prisma from "@db";

export async function getWorkspaceOrFail(slug: string) {
  const ws = await prisma.workspace.findFirst({where: {slug, deletedAt: null}});
  if (!ws) throw {status: 404, message: "Workspace não encontrado."};
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
  if (!m) throw {status: 403, message: "Você não tem permissão para executar esta ação."};
  return m;
}

/**
 * Projetos de que o usuário é membro ativo no workspace. É o recorte de
 * visibilidade da listagem de chamados do workspace: quem participa do projeto vê
 * todos os chamados dele, e só dele.
 */
export async function findMemberProjectIds(workspaceId: string, userId: string): Promise<string[]> {
  const membros = await prisma.projectMember.findMany({
    where: {workspaceId, memberId: userId, isActive: true, deletedAt: null},
    select: {projectId: true},
  });
  return membros.map((m) => m.projectId);
}

// Não há guarda por nível aqui: "pode fazer X" é `requireWorkspaceAction` /
// `requireProjectAction` (utils/permission-checks.ts), pela matriz de ações.

/**
 * Quem participa de todo sistema sem precisar de vínculo em `project_members`:
 * admin (20) e Gestor de Projeto (18). A regra é UMA, usada pelo guard de
 * projeto, pela lista de sistemas e por `members/me`. Quem virava gestor sem
 * vínculo não conseguia aceitar nem recusar chamado em sistema nenhum.
 */
// permissao-estrutural: participação nos sistemas, não checagem de ação.
export const NIVEL_QUE_PARTICIPA_DE_TODO_SISTEMA = 18;

export const isParticipanteDeTodoSistema = (role: number): boolean => role >= NIVEL_QUE_PARTICIPA_DE_TODO_SISTEMA;

const PREFIXO_DO_VINCULO_SINTETICO: Record<number, string> = {20: "ws-admin", 18: "ws-gestor"};

/** Vínculo em memória, no nível e na função do espaço, para quem participa de todo sistema. */
const buildVinculoSintetico = (
  projectId: string,
  workspaceId: string,
  participante: {memberId: string; role: number; workflowRoleId: string | null},
) =>
  ({
    id: `${PREFIXO_DO_VINCULO_SINTETICO[participante.role] ?? "ws-participante"}-${participante.memberId}`,
    projectId,
    workspaceId,
    memberId: participante.memberId,
    role: participante.role,
    workflowRoleId: participante.workflowRoleId,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    sortOrder: null as any,
  }) as any;

export async function getProjectOrFail(workspaceId: string, projectId: string, userId: string, options?: {allowInstanceAdmin?: boolean}) {
  const project = await prisma.project.findFirst({
    where: {id: projectId, workspaceId, deletedAt: null},
  });
  if (!project) throw {status: 404, message: "Projeto não encontrado."};

  let member = await prisma.projectMember.findFirst({
    where: {projectId, memberId: userId, isActive: true, deletedAt: null},
  });

  // Admin e Gestor de Projeto participam de todo sistema, mesmo sem vínculo
  // gravado. Vale também quando existe um vínculo de nível menor (migrações que
  // puseram o admin nos sistemas como 15): sem elevar, a pessoa tomava 403 em
  // ação de função, como a transição de etapa, no próprio sistema.
  const participante = await prisma.workspaceMember.findFirst({
    // permissao-estrutural: quem participa de todo sistema (isParticipanteDeTodoSistema).
    where: {workspaceId, memberId: userId, role: {gte: NIVEL_QUE_PARTICIPA_DE_TODO_SISTEMA}, isActive: true, deletedAt: null},
  });
  if (participante) {
    member = member
      ? // A função vem junto com o nível: manter o `workflowRoleId` da associação
        // ao sistema fazia resolveRole devolver a função baixa gravada ali (ela tem
        // prioridade sobre o nível), e o admin tomava 403 no próprio sistema.
        ({...member, role: Math.max(member.role, participante.role), workflowRoleId: participante.workflowRoleId ?? null} as any)
      : buildVinculoSintetico(projectId, workspaceId, participante);
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

  if (!member) throw {status: 403, message: "Você não é membro deste projeto."};

  return {project, member};
}
