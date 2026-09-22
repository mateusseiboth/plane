import prisma from "@db";
import { seedWorkflowRoles } from "@utils/permissions";

/**
 * Grava (ou sincroniza) as funções de sistema em todo espaço de trabalho.
 *
 * Roda no boot da API. Sem isto as funções só existiam onde alguém rodou o
 * `scripts/seed.ts`: espaço criado depois ficava sem função gravada, a tela de
 * Funções abria vazia e ação nova do catálogo nunca chegava a quem já existia.
 * É idempotente; edições do admin sobrevivem (ver `mergeNewActions`).
 */
export async function seedWorkflowRolesForAllWorkspaces(): Promise<number> {
  const espacos = await prisma.workspace.findMany({ where: { deletedAt: null }, select: { id: true } });
  for (const ws of espacos) await seedWorkflowRoles(prisma, ws.id);
  return espacos.length;
}
