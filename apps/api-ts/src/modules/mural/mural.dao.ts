/**
 * DAO do mural: só acesso a dados. Toda regra (vigência, ordem da home, quem
 * vê inativo) vive em `mural.service.ts` e `mural.rules.ts`.
 */
import prisma from "@db";
import type { Prisma } from "@prisma/client";

const SELECT_PESSOA = {
  id: true,
  displayName: true,
  firstName: true,
  lastName: true,
  avatar: true,
  avatarUrl: true,
} as const;

export type MuralPessoa = Prisma.UserGetPayload<{ select: typeof SELECT_PESSOA }>;

export type MuralRecadoRow = Prisma.MuralRecadoGetPayload<object>;

export const muralDao = {
  findRecados: (where: Prisma.MuralRecadoWhereInput, skip: number, take: number) =>
    prisma.muralRecado.findMany({ where, skip, take, orderBy: [{ publishedAt: "desc" }, { id: "desc" }] }),

  countRecados: (where: Prisma.MuralRecadoWhereInput) => prisma.muralRecado.count({ where }),

  findVigentes: (workspaceId: string, now: Date, extra: Prisma.MuralRecadoWhereInput = {}) =>
    prisma.muralRecado.findMany({
      where: { workspaceId, isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], ...extra },
      orderBy: { publishedAt: "desc" },
    }),

  findRecado: (workspaceId: string, id: string) => prisma.muralRecado.findFirst({ where: { id, workspaceId } }),

  createRecado: (data: Prisma.MuralRecadoUncheckedCreateInput) => prisma.muralRecado.create({ data }),

  updateRecado: (id: string, data: Prisma.MuralRecadoUncheckedUpdateInput) =>
    prisma.muralRecado.update({ where: { id }, data }),

  findLeiturasDoUsuario: (userId: string, recadoIds: string[]) =>
    prisma.muralLeitura.findMany({ where: { userId, recadoId: { in: recadoIds } } }),

  saveLeitura: async (recadoId: string, userId: string) => {
    // A primeira leitura é a que vale: abrir de novo não muda a data.
    await prisma.muralLeitura.upsert({
      where: { recadoId_userId: { recadoId, userId } },
      create: { recadoId, userId },
      update: {},
    });
  },

  findLeiturasDoRecado: (recadoId: string) =>
    prisma.muralLeitura.findMany({ where: { recadoId }, orderBy: { readAt: "asc" } }),

  findUsuarios: (ids: string[]) => prisma.user.findMany({ where: { id: { in: ids } }, select: SELECT_PESSOA }),

  findAnexos: (workspaceId: string, ids: string[]) =>
    prisma.fileAsset.findMany({ where: { id: { in: ids }, workspaceId, isDeleted: false } }),

  findMembrosAtivos: async (workspaceId: string): Promise<MuralPessoa[]> => {
    const membros = await prisma.workspaceMember.findMany({
      where: { workspaceId, isActive: true, deletedAt: null, member: { isActive: true, isBotUser: false } },
      select: { member: { select: SELECT_PESSOA } },
      orderBy: { member: { displayName: "asc" } },
    });
    return membros.map((m) => m.member);
  },
};

export type MuralDao = typeof muralDao;
