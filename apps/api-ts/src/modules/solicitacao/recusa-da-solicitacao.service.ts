/**
 * Depois de recusar: o motivo vira comentário no chamado e quem abriu a
 * solicitação recebe no sino. Antes a recusa era silenciosa e o atendimento
 * não sabia o que responder ao cliente.
 */
import prisma from "@db";
import { buildComentarioDaRecusa } from "@modules/solicitacao/recusa-da-solicitacao.rules";
import { markChamadoNaoLido } from "@utils/chamado-nao-lido";
import { notifyRecusaDaSolicitacao } from "@utils/notifications";
import { publishRealtime } from "@utils/realtime";

type Recusa = { workspaceId: string; projectId: string; issueId: string; actorId: string; motivo: string };

/** Quem abriu: o registro da triagem guarda; solicitação antiga só tem o criador do chamado. */
const findQuemAbriu = async (issueId: string): Promise<string | null> => {
  const [triagem, chamado] = await Promise.all([
    prisma.intakeIssue.findFirst({ where: { issueId, deletedAt: null }, select: { createdById: true } }),
    prisma.issue.findFirst({ where: { id: issueId }, select: { createdById: true, name: true } }),
  ]);
  return triagem?.createdById ?? chamado?.createdById ?? null;
};

export async function saveRecusaDaSolicitacao(recusa: Recusa): Promise<void> {
  const { workspaceId, projectId, issueId, actorId, motivo } = recusa;
  const comentario = buildComentarioDaRecusa(motivo);
  const criado = await prisma.issueComment.create({
    data: {
      issueId,
      projectId,
      workspaceId,
      actorId,
      createdById: actorId,
      commentHtml: comentario.html,
      commentStripped: comentario.texto,
      access: "INTERNAL",
    },
  });
  await markChamadoNaoLido({ issueId, actorId });
  publishRealtime(workspaceId, {
    entity: "comment",
    action: "create",
    project_id: projectId,
    issue_id: issueId,
    id: criado.id,
    actor: actorId,
  });

  const quemAbriu = await findQuemAbriu(issueId);
  if (!quemAbriu || quemAbriu === actorId) return;
  const chamado = await prisma.issue.findFirstOrThrow({ where: { id: issueId }, select: { name: true } });
  await notifyRecusaDaSolicitacao({
    workspaceId,
    projectId,
    issueId,
    actorId,
    receiverId: quemAbriu,
    issueName: chamado.name,
    motivo,
  });
}
