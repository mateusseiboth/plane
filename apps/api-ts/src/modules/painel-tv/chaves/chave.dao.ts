/**
 * DAO das chaves de painel e da configuração das colunas: só acesso a dados.
 * Toda regra (hash, escopo, limite) vive em `chave.service.ts`.
 */
import prisma from "@db";
import type { Prisma } from "@prisma/client";

export type ChaveGravada = Prisma.PainelChaveGetPayload<object>;

export const chaveDao = {
  findChaves: (workspaceId: string) =>
    prisma.painelChave.findMany({ where: { workspaceId }, orderBy: [{ isActive: "desc" }, { createdAt: "desc" }] }),

  findChave: (workspaceId: string, id: string) => prisma.painelChave.findFirst({ where: { id, workspaceId } }),

  findPorHash: (keyHash: string) => prisma.painelChave.findUnique({ where: { keyHash } }),

  createChave: (data: Prisma.PainelChaveUncheckedCreateInput) => prisma.painelChave.create({ data }),

  revokeChave: (id: string, data: Prisma.PainelChaveUncheckedUpdateInput) =>
    prisma.painelChave.update({ where: { id }, data }),

  /**
   * Último uso, no máximo uma gravação por minuto por chave: a TV bate a cada
   * atualização, e a coluna só existe para o admin saber se aquela TV ainda vive.
   */
  touchChave: async (id: string, agora: Date) => {
    const umMinutoAtras = new Date(agora.getTime() - 60_000);
    await prisma.painelChave.updateMany({
      where: { id, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: umMinutoAtras } }] },
      data: { lastUsedAt: agora },
    });
  },

  findConfig: (workspaceId: string, panel: string) =>
    prisma.painelConfig.findUnique({ where: { workspaceId_panel: { workspaceId, panel } } }),

  saveConfig: (workspaceId: string, panel: string, columns: Prisma.InputJsonValue, updatedById: string) =>
    prisma.painelConfig.upsert({
      where: { workspaceId_panel: { workspaceId, panel } },
      create: { workspaceId, panel, columns, updatedById },
      update: { columns, updatedById },
    }),

  deleteConfig: async (workspaceId: string, panel: string) => {
    await prisma.painelConfig.deleteMany({ where: { workspaceId, panel } });
  },
};

export type ChaveDao = typeof chaveDao;
