/**
 * A caixa de triagem de um projeto e o estado em que a solicitação nasce.
 *
 * Fonte única: as duas funções moravam dentro do módulo de projeto e passaram a
 * ser necessárias também no portal do cliente, que abre solicitação pelo mesmo
 * caminho. Duas cópias divergiriam no dia em que o estado de triagem mudasse de
 * nome — e a solicitação do cliente cairia num estado diferente da do time.
 */

import prisma from "@db";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, recordAudit } from "@utils/audit";
import { notifyQualityOfIntake } from "@utils/notifications";
import { publishRealtime } from "@utils/realtime";
import { nextSequenceId } from "@utils/sequence";

/**
 * O estado de triagem do projeto, criado na hora se não existir: solicitação
 * sem estado apareceria fora de qualquer coluna do quadro.
 *
 * A busca é pela marca `isTriage` e só depois pelo grupo — projeto antigo tem o
 * estado certo sem a marca, e aí a marca é gravada de uma vez.
 */
export async function findTriageState(projectId: string) {
  const byFlag = await prisma.state.findFirst({ where: { projectId, isTriage: true, deletedAt: null } });
  if (byFlag) return byFlag;

  const byGroup = await prisma.state.findFirst({ where: { projectId, group: "triage", deletedAt: null } });
  if (byGroup) {
    await prisma.state.update({ where: { id: byGroup.id }, data: { isTriage: true } });
    return byGroup;
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { workspaceId: true },
  });
  if (!project) return null;
  return prisma.state.create({
    data: {
      projectId,
      workspaceId: project.workspaceId,
      name: "Triagem",
      color: "#6366f1",
      group: "triage",
      sequence: 5000,
      isTriage: true,
      slug: "triagem",
    },
  });
}

/** A única caixa de triagem ativa do projeto. */
export async function findOrCreateIntake(projectId: string, workspaceId: string) {
  const existing = await prisma.intake.findFirst({ where: { projectId, deletedAt: null, isActive: true } });
  if (existing) return existing;
  return prisma.intake.create({ data: { projectId, workspaceId } });
}

export type NovaSolicitacaoDoTime = {
  workspaceId: string;
  projectId: string;
  user: { id: string; email?: string | null };
  name: string;
  priority?: string;
  descriptionHtml?: string;
  entityId?: string | null;
  assigneeIds?: string[];
  /** De onde o chamado veio, quando não foi digitado na tela (ex.: "chat" + id da conversa). */
  externalSource?: string;
  externalId?: string;
  headers?: Record<string, string | undefined>;
  auditMetadata?: Record<string, unknown>;
};

/**
 * Abre a solicitação na triagem em nome de alguém do time. Fonte única do
 * `POST /inbox-issues/` e da abertura a partir do chat: as duas nascem iguais
 * (triagem, sequência, quem abriu atribuído, aviso à Qualidade, tempo real e
 * trilha LGPD). O portal do cliente tem caminho próprio porque não há usuário
 * do Plane por trás (ver modules/portal/solicitacoes.ts).
 */
export async function createSolicitacao(dados: NovaSolicitacaoDoTime) {
  const { workspaceId, projectId, user } = dados;
  const triageState = await findTriageState(projectId);
  const issue = await prisma.issue.create({
    data: {
      projectId,
      workspaceId,
      sequenceId: await nextSequenceId(prisma, projectId),
      name: dados.name,
      stateId: triageState?.id ?? null,
      priority: dados.priority ?? "none",
      isDraft: false,
      createdById: user.id,
      ...(dados.descriptionHtml !== undefined
        ? { descriptionHtml: dados.descriptionHtml, descriptionStripped: dados.descriptionHtml.replace(/<[^>]+>/g, "") }
        : {}),
      ...(dados.entityId ? { entityId: dados.entityId } : {}),
      ...(dados.externalSource ? { externalSource: dados.externalSource, externalId: dados.externalId ?? null } : {}),
    },
  });
  const intake = await findOrCreateIntake(projectId, workspaceId);
  await prisma.intakeIssue.create({
    // `createdById` é quem fica esperando a resposta quando o chamado for
    // concluído (ver modules/portal/resposta). Sem ele a fila não sabe o nome
    // de quem pediu, nem para quem tocar o sino.
    data: {
      intakeId: intake.id,
      issueId: issue.id,
      workspaceId,
      projectId,
      status: -2,
      source: "in-app",
      createdById: user.id,
    },
  });
  // Quem abriu fica atribuído (mais os responsáveis informados), como na criação do chamado.
  const assigneeSet = new Set<string>([user.id, ...(dados.assigneeIds ?? [])]);
  await prisma.issueAssignee.createMany({
    data: Array.from(assigneeSet).map((uid) => ({ issueId: issue.id, assigneeId: uid, workspaceId, projectId })),
    skipDuplicates: true,
  });
  await notifyQualityOfIntake({ workspaceId, projectId, issueId: issue.id, actorId: user.id, issueName: issue.name });
  publishRealtime(workspaceId, {
    entity: "intake",
    action: "create",
    project_id: projectId,
    id: issue.id,
    issue_id: issue.id,
    actor: user.id,
  });
  publishRealtime(workspaceId, {
    entity: "issue",
    action: "create",
    project_id: projectId,
    id: issue.id,
    actor: user.id,
  });
  // LGPD: abertura de solicitação (pedido de chamado) pelo cliente.
  recordAudit({
    workspaceId,
    entity: AUDIT_ENTITIES.INTAKE,
    entityId: issue.id,
    action: AUDIT_ACTIONS.CREATE,
    actor: user,
    headers: dados.headers,
    metadata: { project_id: projectId, name: issue.name, ...dados.auditMetadata },
  });
  return issue;
}
