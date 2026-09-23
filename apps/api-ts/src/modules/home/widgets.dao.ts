/**
 * DAO das preferências da grade de widgets da home: só lê e grava o JSON de
 * `workspace_user_properties.display_filters`. A forma do que entra e sai é
 * regra de `widgets.rules.ts`.
 */
import prisma from "@db";
import type { EscopoDaPessoa } from "@modules/home/painel.dao";

const onde = ({ workspaceId, userId }: EscopoDaPessoa) => ({ workspaceId_userId: { workspaceId, userId } });

export const widgetsDao = {
  async readDisplayFilters(escopo: EscopoDaPessoa): Promise<unknown> {
    const props = await prisma.workspaceUserProperties.findUnique({
      where: onde(escopo),
      select: { displayFilters: true },
    });
    return props?.displayFilters ?? {};
  },

  async saveDisplayFilters(escopo: EscopoDaPessoa, displayFilters: Record<string, unknown>): Promise<void> {
    const valor = displayFilters as object;
    await prisma.workspaceUserProperties.upsert({
      where: onde(escopo),
      update: { displayFilters: valor },
      create: { workspaceId: escopo.workspaceId, userId: escopo.userId, displayFilters: valor },
    });
  },
};

export type WidgetsDao = typeof widgetsDao;
