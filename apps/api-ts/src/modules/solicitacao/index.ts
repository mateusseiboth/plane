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
 *
 * `GET /workspaces/:slug/global-intake-issues/resumo/` e
 * `POST /workspaces/:slug/global-intake-issues/:issue_id/visto/`
 *
 * O número ao lado do item Solicitação/Triagem do menu (resolvidas que quem
 * abriu ainda não viu) e o visto de quem abriu, que devolve o número novo para
 * o menu atualizar na hora. Regras em ./visto-da-solicitacao.service.
 */

import { Elysia } from "elysia";
import prisma from "@db";
import { authPlugin } from "@middleware/auth";
import { EProjectAction, requireWorkspaceAction } from "@utils/permission-checks";
import { markVistoPeloSolicitante, readResumoDaTriagem } from "@modules/solicitacao/visto-da-solicitacao.service";
import { getWorkspaceOrFail, requireWorkspaceMember } from "@utils/workspace";

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
  })
  .get("/global-intake-issues/resumo/", async ({ params: { slug }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return readResumoDaTriagem(ws.id, user.id);
  })
  .post("/global-intake-issues/:issue_id/visto/", async ({ params: { slug, issue_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return markVistoPeloSolicitante(ws.id, issue_id, user.id);
  });
