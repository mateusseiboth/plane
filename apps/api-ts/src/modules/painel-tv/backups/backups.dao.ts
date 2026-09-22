/** Só acesso a dados: a entidade que a gaveta do histórico abriu. */
import prisma from "@db";
import type { EntidadeDoEspaco } from "@modules/painel-tv/mapa/mapa.dao";

export function findEntidadeDoEspaco(workspaceId: string, entidadeId: string): Promise<EntidadeDoEspaco | null> {
  return prisma.entity.findFirst({
    where: { id: entidadeId, workspaceId, deletedAt: null },
    select: { id: true, name: true, city: true, state: true, legacyId: true },
  });
}
