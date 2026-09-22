/**
 * DAO dos Links úteis: só acesso a dados. Toda regra de qual cartão aparece
 * vive em `links-uteis.ts`.
 */
import prisma from "@db";

/** Sistemas do espaço, na ordem em que a tela os oferece. */
export const findSistemasDoEspaco = (workspaceId: string) =>
  prisma.project.findMany({
    where: { workspaceId, deletedAt: null, archivedAt: null },
    select: { identifier: true, name: true },
    orderBy: { name: "asc" },
  });
