/**
 * "Não atendido": o atendimento diz que o cliente não foi atendido depois que a
 * Qualidade concluiu o chamado. O chamado volta para a Triagem e a solicitação
 * para Pendente, o motivo vira comentário e a Qualidade é avisada no sino.
 * Regras em `atendimento-da-solicitacao.rules.ts`.
 */
import prisma from "@db";
import { buildComentarioDoNaoAtendido, STATUS_PENDENTE } from "@modules/solicitacao/atendimento-da-solicitacao.rules";
import { buildMudancaDeEtapa, recordActivities } from "@utils/activity";
import { markChamadoNaoLido } from "@utils/chamado-nao-lido";
import { findTriageState } from "@utils/intake";
import { notifyQualityOfNaoAtendido } from "@utils/notifications";
import { publishRealtime } from "@utils/realtime";

type NaoAtendido = { workspaceId: string; projectId: string; issueId: string; actorId: string; motivo: string };

export async function saveNaoAtendido(pedido: NaoAtendido): Promise<void> {
  const { workspaceId, projectId, issueId, actorId, motivo } = pedido;
  const antes = await prisma.issue.findUniqueOrThrow({
    where: { id: issueId },
    include: { state: { select: { group: true, name: true } } },
  });
  const triagem = await findTriageState(projectId);
  if (!triagem) throw new Error("Sistema sem etapa de triagem.");
  const comentario = buildComentarioDoNaoAtendido(motivo);

  await prisma.$transaction([
    prisma.issue.update({
      where: { id: issueId },
      data: { stateId: triagem.id, completedAt: null, updatedById: actorId },
    }),
    // Volta a contar como resolvida não vista quando concluir de novo.
    prisma.intakeIssue.updateMany({
      where: { issueId, deletedAt: null },
      data: { status: STATUS_PENDENTE, vistoPeloSolicitanteEm: null },
    }),
    prisma.issueComment.create({
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
    }),
  ]);

  const mudancaDeEtapa = await buildMudancaDeEtapa(antes, triagem.id);
  if (mudancaDeEtapa) await recordActivities({ issueId, workspaceId, projectId, actorId }, [mudancaDeEtapa]);
  await markChamadoNaoLido({ issueId, actorId });
  await notifyQualityOfNaoAtendido({ workspaceId, projectId, issueId, actorId, issueName: antes.name, motivo });

  publishRealtime(workspaceId, {
    entity: "intake",
    action: "update",
    project_id: projectId,
    id: issueId,
    issue_id: issueId,
    actor: actorId,
  });
  publishRealtime(workspaceId, {
    entity: "issue",
    action: "update",
    project_id: projectId,
    id: issueId,
    actor: actorId,
  });
}
