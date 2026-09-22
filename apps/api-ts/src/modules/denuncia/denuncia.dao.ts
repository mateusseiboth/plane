/**
 * DAO da denúncia interna: só acesso a dados. A ordem da lista é pelo dia e
 * pelo id (v4, aleatório): nada que revele a ordem de gravação dentro do dia.
 */
import prisma from "@db";
import type { Prisma } from "@prisma/client";

export type DenunciaRow = Prisma.DenunciaGetPayload<object>;

export const denunciaDao = {
  create: (data: Prisma.DenunciaUncheckedCreateInput) => prisma.denuncia.create({ data }),

  findMany: (workspaceId: string, skip: number, take: number) =>
    prisma.denuncia.findMany({
      where: { workspaceId },
      skip,
      take,
      orderBy: [{ reportedOn: "desc" }, { id: "asc" }],
    }),

  count: (workspaceId: string) => prisma.denuncia.count({ where: { workspaceId } }),

  findUsuarios: (ids: string[]) =>
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }),
};

export type DenunciaDao = typeof denunciaDao;
