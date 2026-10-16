/**
 * `GET /workspaces/:slug/sistemas-para-solicitacao/`
 *
 * Os sistemas para os quais quem tem `intake.create` pode abrir solicitação:
 * TODOS os do espaço, sem filtro por vínculo. O Atendimento abre pedido para
 * qualquer sistema (a triagem é de quem recebe o pedido), e a maioria das
 * pessoas do Atendimento não participa de sistema nenhum, então a listagem de
 * `GET /projects/` (que filtra por vínculo) deixaria o modal vazio.
 *
 * Devolve só id, nome e identificador: é a lista de um seletor.
 */

import { Elysia } from "elysia";
import prisma from "@db";
import { authPlugin } from "@middleware/auth";
import { EProjectAction, requireWorkspaceAction } from "@utils/permission-checks";
import { getWorkspaceOrFail } from "@utils/workspace";

export const solicitacaoModule = new Elysia({ prefix: "/workspaces/:slug" })
  .use(authPlugin)
  .get("/sistemas-para-solicitacao/", async ({ params: { slug }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceAction(ws.id, user.id, EProjectAction.INTAKE_CREATE);
    return prisma.project.findMany({
      where: { workspaceId: ws.id, deletedAt: null, archivedAt: null },
      select: { id: true, name: true, identifier: true },
      orderBy: { name: "asc" },
    });
  });
