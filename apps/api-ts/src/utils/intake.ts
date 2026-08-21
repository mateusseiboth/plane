/**
 * A caixa de triagem de um projeto e o estado em que a solicitação nasce.
 *
 * Fonte única: as duas funções moravam dentro do módulo de projeto e passaram a
 * ser necessárias também no portal do cliente, que abre solicitação pelo mesmo
 * caminho. Duas cópias divergiriam no dia em que o estado de triagem mudasse de
 * nome — e a solicitação do cliente cairia num estado diferente da do time.
 */

import prisma from "@db";

/**
 * O estado de triagem do projeto, criado na hora se não existir: solicitação
 * sem estado apareceria fora de qualquer coluna do quadro.
 *
 * A busca é pela marca `isTriage` e só depois pelo grupo — projeto antigo tem o
 * estado certo sem a marca, e aí a marca é gravada de uma vez.
 */
export async function findTriageState(projectId: string) {
  const byFlag = await prisma.state.findFirst({ where: { projectId, isTriage: true, deletedAt: null } });
  if (byFlag) return byFlag;

  const byGroup = await prisma.state.findFirst({ where: { projectId, group: "triage", deletedAt: null } });
  if (byGroup) {
    await prisma.state.update({ where: { id: byGroup.id }, data: { isTriage: true } });
    return byGroup;
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { workspaceId: true },
  });
  if (!project) return null;
  return prisma.state.create({
    data: {
      projectId,
      workspaceId: project.workspaceId,
      name: "Triagem",
      color: "#6366f1",
      group: "triage",
      sequence: 5000,
      isTriage: true,
      slug: "triagem",
    },
  });
}

/** A única caixa de triagem ativa do projeto. */
export async function findOrCreateIntake(projectId: string, workspaceId: string) {
  const existing = await prisma.intake.findFirst({ where: { projectId, deletedAt: null, isActive: true } });
  if (existing) return existing;
  return prisma.intake.create({ data: { projectId, workspaceId } });
}
