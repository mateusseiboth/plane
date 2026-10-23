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
 * `GET /workspaces/:slug/global-intake-issues/resumo/`
 *
 * O número ao lado do item Solicitação/Triagem do menu: quantas solicitações
 * que a própria pessoa abriu estão resolvidas e ainda não foram marcadas como
 * atendidas (`FILTRO_RESOLVIDA_PARA_ATENDER`). Conta só o que ela abriu, em
 * qualquer sistema do espaço, sem exigir vínculo: é o pedido dela.
 */

import { Elysia } from "elysia";
import prisma from "@db";
import { authPlugin } from "@middleware/auth";
import { EProjectAction, requireWorkspaceAction } from "@utils/permission-checks";
import { FILTRO_RESOLVIDA_PARA_ATENDER } from "@utils/situacao-da-solicitacao";
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
    const resolvidas = await prisma.intakeIssue.count({
      where: {
        workspaceId: ws.id,
        createdById: user.id,
        deletedAt: null,
        issue: { deletedAt: null },
        ...FILTRO_RESOLVIDA_PARA_ATENDER,
      },
    });
    return { resolvidas_para_atender: resolvidas };
  });
