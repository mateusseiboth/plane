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
 * `POST /workspaces/:slug/projects/:project_id/inbox-issues/:issue_id/nao-atendido/`
 *
 * O atendimento diz que o cliente NÃO foi atendido depois que a Qualidade
 * concluiu: exige `motivo` e devolve o chamado para a triagem. Regras em
 * ./atendimento-da-solicitacao.rules, efeitos em ./nao-atendido.service.
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
import { getProjectOrFail, getWorkspaceOrFail, requireWorkspaceMember } from "@utils/workspace";
import { resolveMemberRole } from "@utils/permission-checks";
import {
  MENSAGEM_NAO_CONCLUIDO,
  MENSAGEM_SEM_PERMISSAO,
  isAguardandoConfirmacao,
  isQuemConfirmaAtendimento,
  readMotivoDoNaoAtendido,
} from "@modules/solicitacao/atendimento-da-solicitacao.rules";
import { saveNaoAtendido } from "@modules/solicitacao/nao-atendido.service";

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
  .post(
    "/projects/:project_id/inbox-issues/:issue_id/nao-atendido/",
    async ({ params: { slug, project_id, issue_id }, body, user, set }) => {
      const ws = await getWorkspaceOrFail(slug);
      const { member } = await getProjectOrFail(ws.id, project_id, user.id);
      const solicitacao = await prisma.intakeIssue.findFirst({
        where: { issueId: issue_id, projectId: project_id, deletedAt: null },
        select: {
          status: true,
          createdById: true,
          issue: { select: { createdById: true, state: { select: { group: true } } } },
        },
      });
      if (!solicitacao) {
        set.status = 404;
        return { detail: "Solicitação não encontrada." };
      }
      const quemAbriu = solicitacao.createdById ?? solicitacao.issue?.createdById ?? null;
      const role = await resolveMemberRole(ws.id, member as any);
      if (!isQuemConfirmaAtendimento({ isQuemAbriu: quemAbriu === user.id, role })) {
        set.status = 403;
        return { detail: MENSAGEM_SEM_PERMISSAO };
      }
      if (
        !isAguardandoConfirmacao({ status: solicitacao.status, grupoDaEtapa: solicitacao.issue?.state?.group ?? null })
      ) {
        set.status = 400;
        return { detail: MENSAGEM_NAO_CONCLUIDO };
      }
      const motivo = readMotivoDoNaoAtendido((body ?? {}) as { motivo?: unknown });
      await saveNaoAtendido({ workspaceId: ws.id, projectId: project_id, issueId: issue_id, actorId: user.id, motivo });
      return { id: issue_id, status: -2 };
    }
  )
  .post("/global-intake-issues/:issue_id/visto/", async ({ params: { slug, issue_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    return markVistoPeloSolicitante(ws.id, issue_id, user.id);
  });
