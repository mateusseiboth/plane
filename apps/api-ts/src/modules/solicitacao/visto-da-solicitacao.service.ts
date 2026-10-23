/**
 * O número do menu Solicitação/Triagem e o visto de quem abriu a solicitação.
 *
 * Conta as solicitações que a própria pessoa abriu, já resolvidas e que ela
 * ainda não viu (`FILTRO_RESOLVIDA_NAO_VISTA`), em qualquer sistema do espaço:
 * é o pedido dela, sem exigir vínculo com o sistema. Abrir a solicitação
 * resolvida grava o visto; só quem abriu marca, e marcar de novo não muda nada.
 */
import prisma from "@db";
import { FILTRO_RESOLVIDA_NAO_VISTA, isResolvidaNaoVista } from "@utils/situacao-da-solicitacao";

export type ResumoDaTriagem = { resolvidas_nao_vistas: number };

export async function readResumoDaTriagem(workspaceId: string, userId: string): Promise<ResumoDaTriagem> {
  const resolvidas = await prisma.intakeIssue.count({
    where: {
      workspaceId,
      createdById: userId,
      deletedAt: null,
      issue: { deletedAt: null },
      ...FILTRO_RESOLVIDA_NAO_VISTA,
    },
  });
  return { resolvidas_nao_vistas: resolvidas };
}

const findSolicitacaoDoChamado = (workspaceId: string, issueId: string) =>
  prisma.intakeIssue.findFirst({
    where: { workspaceId, issueId, deletedAt: null },
    select: {
      id: true,
      createdById: true,
      status: true,
      vistoPeloSolicitanteEm: true,
      issue: { select: { state: { select: { group: true } } } },
    },
  });

/**
 * Quem abriu viu a solicitação. Só grava quando ela já está resolvida: visto
 * dado antes da conclusão esconderia a conclusão do menu.
 */
export async function markVistoPeloSolicitante(
  workspaceId: string,
  issueId: string,
  userId: string
): Promise<ResumoDaTriagem> {
  const solicitacao = await findSolicitacaoDoChamado(workspaceId, issueId);
  if (!solicitacao) throw { status: 404, message: "Solicitação não encontrada." };
  if (solicitacao.createdById !== userId)
    throw { status: 403, message: "Só quem abriu a solicitação marca como vista." };

  const isPendenteDeVisto = isResolvidaNaoVista({
    status: solicitacao.status,
    grupoDaEtapa: solicitacao.issue?.state?.group ?? null,
    vistoPeloSolicitanteEm: solicitacao.vistoPeloSolicitanteEm,
  });
  if (isPendenteDeVisto)
    await prisma.intakeIssue.update({ where: { id: solicitacao.id }, data: { vistoPeloSolicitanteEm: new Date() } });
  return readResumoDaTriagem(workspaceId, userId);
}
