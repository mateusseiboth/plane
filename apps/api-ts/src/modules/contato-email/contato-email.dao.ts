/** DAO da lista de e-mails: só as duas consultas (responsáveis e membros internos). */
import prisma from "@db";
import type { Prisma } from "@prisma/client";

export const contatoEmailDao = {
  findContatos: (where: Prisma.EntityContactWhereInput) =>
    prisma.entityContact.findMany({
      where,
      select: { email: true, name: true, entity: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),

  findMembros: async (workspaceId: string) => {
    const membros = await prisma.workspaceMember.findMany({
      where: { workspaceId, isActive: true, deletedAt: null, member: { isActive: true, deletedAt: null } },
      select: { member: { select: { email: true, displayName: true } } },
    });
    return membros.map((m) => m.member);
  },
};

export type ContatoEmailDao = typeof contatoEmailDao;
