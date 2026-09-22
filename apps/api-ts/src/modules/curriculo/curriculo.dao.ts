/**
 * DAO dos currículos: só acesso a dados. Regra (PDF, marcações, prazo de
 * guarda) vive em `curriculo.rules.ts` e `curriculo.service.ts`.
 */
import prisma from "@db";
import type { Prisma } from "@prisma/client";

export type CurriculoRow = Prisma.CurriculoGetPayload<object>;

export const curriculoDao = {
  create: (data: Prisma.CurriculoUncheckedCreateInput) => prisma.curriculo.create({ data }),

  findMany: (where: Prisma.CurriculoWhereInput, skip: number, take: number) =>
    prisma.curriculo.findMany({ where, skip, take, orderBy: [{ receivedAt: "desc" }, { id: "desc" }] }),

  count: (where: Prisma.CurriculoWhereInput) => prisma.curriculo.count({ where }),

  findOne: (workspaceId: string, id: string) => prisma.curriculo.findFirst({ where: { id, workspaceId } }),

  update: (id: string, data: Prisma.CurriculoUncheckedUpdateInput) => prisma.curriculo.update({ where: { id }, data }),

  remove: async (id: string) => {
    await prisma.curriculo.deleteMany({ where: { id } });
  },

  findPositions: async (workspaceId: string) => {
    const linhas = await prisma.curriculo.findMany({
      where: { workspaceId },
      distinct: ["position"],
      select: { position: true },
      orderBy: { position: "asc" },
    });
    return linhas.map((l) => l.position);
  },

  findUsuarios: (ids: string[]) =>
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }),

  findConfig: (workspaceId: string) => prisma.curriculoConfig.findUnique({ where: { workspaceId } }),

  saveConfig: (workspaceId: string, data: { retentionDays: number; siteEnabled: boolean }) =>
    prisma.curriculoConfig.upsert({
      where: { workspaceId },
      create: { workspaceId, ...data },
      update: data,
    }),

  findConfigs: () => prisma.curriculoConfig.findMany(),

  findRecebidosAntesDe: (limite: Date) => prisma.curriculo.findMany({ where: { receivedAt: { lt: limite } } }),
};

export type CurriculoDao = typeof curriculoDao;
