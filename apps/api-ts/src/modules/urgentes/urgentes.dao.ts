/** Leituras da faixa de urgentes: os chamados e a matriz de Funções que diz o setor de cada um. */
import prisma from "@db";

/** Urgentes ainda abertos (fora de concluído e cancelado), os mais mexidos primeiro. */
export const findUrgentesAbertos = (workspaceId: string) =>
  prisma.issue.findMany({
    where: {
      workspaceId,
      priority: "urgent",
      deletedAt: null,
      isDraft: false,
      state: { group: { notIn: ["completed", "cancelled"] } },
    },
    include: {
      state: { select: { name: true, group: true, color: true } },
      project: { select: { id: true, identifier: true, name: true } },
      assignees: { where: { deletedAt: null }, select: { assigneeId: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

export const findFuncoesDoEspaco = (workspaceId: string) =>
  prisma.workflowRole.findMany({
    where: { workspaceId, deletedAt: null },
    select: { id: true, name: true, level: true, permissions: true },
  });

export const findTransicoesPermitidas = (workspaceId: string) =>
  prisma.roleStateTransition.findMany({
    where: { workspaceId, allowed: true },
    select: { fromStateName: true, roleId: true },
  });

/** A função de cada pessoa no espaço: o setor dela. */
export const findFuncaoDosMembros = (workspaceId: string, memberIds: string[]) =>
  prisma.workspaceMember.findMany({
    where: { workspaceId, memberId: { in: memberIds }, deletedAt: null, workflowRoleId: { not: null } },
    select: { memberId: true, workflowRoleId: true },
  });
