/**
 * O sistema escolhido no modal, só para dar prioridade às páginas dele na
 * wiki da Quality. Não exige vínculo: o Atendimento quase nunca participa de
 * sistema e escolhe qualquer um do espaço.
 */
import prisma from "@db";
import type { SistemaDaBusca } from "@modules/wiki-sugestoes/wiki-sugestoes.rules";

export const findSistemaDaBusca = (workspaceId: string, projectId: string): Promise<SistemaDaBusca | null> =>
  prisma.project.findFirst({
    where: { id: projectId, workspaceId, deletedAt: null },
    select: { identifier: true, name: true },
  });
