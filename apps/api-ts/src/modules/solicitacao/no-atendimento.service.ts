/**
 * O Atendimento decide a solicitação que está com ele: encaminha para a
 * triagem da Qualidade (vira o fluxo normal) ou encerra ali mesmo com a
 * resposta, que vai para quem pediu (no portal, aparece para o cliente).
 * Regras em `no-atendimento.rules.ts`.
 */
import prisma from "@db";
import { pedidoAResponder, registrarResposta, type RespostaEscrita } from "@modules/portal/resposta";
import { saveAtendimentoDaSolicitacao } from "@utils/atendimento-da-solicitacao";
import { notifyQualityOfIntake } from "@utils/notifications";
import { publishRealtime } from "@utils/realtime";

type Decisao = { workspaceId: string; projectId: string; issueId: string; autor: { id: string } & Record<string, any> };

const MARCA_DO_ENCAMINHAMENTO = "solicitacao_encaminhada";

const publishMudanca = ({ workspaceId, projectId, issueId, autor }: Decisao) =>
  publishRealtime(workspaceId, {
    entity: "intake",
    action: "update",
    project_id: projectId,
    id: issueId,
    issue_id: issueId,
    actor: autor.id,
  });

export async function sendParaATriagem(decisao: Decisao): Promise<void> {
  const { workspaceId, projectId, issueId, autor } = decisao;
  await prisma.intakeIssue.updateMany({ where: { issueId, deletedAt: null }, data: { status: -2 } });
  const chamado = await prisma.issue.findUniqueOrThrow({
    where: { id: issueId },
    select: { name: true, priority: true },
  });
  await prisma.issueActivity.create({
    data: {
      issueId,
      workspaceId,
      projectId,
      actorId: autor.id,
      field: MARCA_DO_ENCAMINHAMENTO,
      oldValue: "-3",
      newValue: "-2",
      comment: "encaminhou a solicitação para a triagem",
    },
  });
  await notifyQualityOfIntake({
    workspaceId,
    projectId,
    issueId,
    actorId: autor.id,
    issueName: chamado.name,
    priority: chamado.priority,
  });
  publishMudanca(decisao);
}

export async function closeNoAtendimento(
  decisao: Decisao & { resposta: RespostaEscrita; headers?: Record<string, string | undefined> }
): Promise<void> {
  const { workspaceId, projectId, issueId, autor, resposta, headers } = decisao;
  const pedido = await pedidoAResponder(workspaceId, issueId);
  if (!pedido) return;
  await registrarResposta({ pedido, autor: autor as any, headers, resposta });
  await prisma.intakeIssue.updateMany({ where: { issueId, deletedAt: null }, data: { status: 3 } });
  await saveAtendimentoDaSolicitacao({ issueId, autorId: autor.id, workspaceId, projectId, statusAnterior: -3 });
  publishMudanca(decisao);
}
