/**
 * A caixa de triagem de um projeto e o estado em que a solicitação nasce.
 *
 * Fonte única: as duas funções moravam dentro do módulo de projeto e passaram a
 * ser necessárias também no portal do cliente, que abre solicitação pelo mesmo
 * caminho. Duas cópias divergiriam no dia em que o estado de triagem mudasse de
 * nome — e a solicitação do cliente cairia num estado diferente da do time.
 */

import prisma from "@db";
import { recordActivities } from "@utils/activity";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, recordAudit } from "@utils/audit";
import { markChamadoNaoLido } from "@utils/chamado-nao-lido";
import type { FieldErrorItem } from "@utils/field-error";
import { notifyAtendenteDaSolicitacao, notifyQualityOfIntake } from "@utils/notifications";
import { inicioDeHoje } from "@utils/prazo";
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

const isModuloDoSistema = async (moduleId: string, projectId: string) =>
  Boolean(await prisma.module.findFirst({ where: { id: moduleId, projectId, deletedAt: null }, select: { id: true } }));

const isEntidadeDoEspaco = async (entityId: string, workspaceId: string) =>
  Boolean(
    await prisma.entity.findFirst({ where: { id: entityId, workspaceId, deletedAt: null }, select: { id: true } })
  );

/** O sistema existe neste espaço; senão, 404. Não exige vínculo de quem abre. */
export async function requireSistemaDoEspaco(projectId: string, workspaceId: string): Promise<void> {
  const sistema = await prisma.project.findFirst({
    where: { id: projectId, workspaceId, deletedAt: null },
    select: { id: true },
  });
  if (!sistema) throw { status: 404, message: "Sistema não encontrado." };
}

type ReferenciasDaSolicitacao = {
  projectId: string;
  workspaceId: string;
  moduleId?: string | null;
  entityId?: string | null;
};

/**
 * Os campos da solicitação que apontam para outro registro: o módulo tem de ser
 * do sistema escolhido e a entidade, do espaço. Vale para a abertura pela
 * conversa do chat e para a avulsa; cada recusa volta para o campo dela.
 */
export async function findErrosDaSolicitacao({
  projectId,
  workspaceId,
  moduleId,
  entityId,
}: ReferenciasDaSolicitacao): Promise<FieldErrorItem[]> {
  const [isModuloValido, isEntidadeValida] = await Promise.all([
    !moduleId || isModuloDoSistema(moduleId, projectId),
    !entityId || isEntidadeDoEspaco(entityId, workspaceId),
  ]);
  return [
    ...(isModuloValido ? [] : [{ path: "module_id", message: "O módulo não pertence ao sistema escolhido." }]),
    ...(isEntidadeValida ? [] : [{ path: "entity_id", message: "A entidade não foi encontrada neste espaço." }]),
  ];
}

/** Sem texto e sem imagem: `<p></p>`, `<p><br></p>`, `&nbsp;` e espaço não descrevem nada. */
export const isDescricaoVazia = (html: string | null | undefined): boolean =>
  !/<(img|image-component)\b/i.test(html ?? "") &&
  !(html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();

type CamposDaAbertura = {
  entityId?: string | null;
  descriptionHtml?: string | null;
  /** Pela conversa do chat a descrição é a transcrição; só a avulsa exige o texto. */
  exigeDescricao: boolean;
};

/**
 * O que a abertura não pode deixar em branco (testes da nova intranet,
 * 16/11/2026: gravava sem entidade e sem o problema do cliente). Cada falta
 * volta para o campo dela.
 */
export const findCamposQueFaltamNaSolicitacao = ({
  entityId,
  descriptionHtml,
  exigeDescricao,
}: CamposDaAbertura): FieldErrorItem[] => [
  ...(entityId ? [] : [{ path: "entity_id", message: "Informe a entidade." }]),
  ...(exigeDescricao && isDescricaoVazia(descriptionHtml)
    ? [{ path: "description_html", message: "Descreva o problema do cliente." }]
    : []),
];

/**
 * O início do chamado é o dia em que a solicitação foi aberta (pedido do
 * cliente, 23/10/2026): o prazo conta da abertura pelo Atendimento, não do
 * aceite na triagem, que não mexe neste campo. Data pura, como toda
 * `start_date` (começo do dia no fuso do escritório, ver @utils/prazo).
 */
export const buildInicioDaSolicitacao = (abertaEm: Date = new Date()): Date => inicioDeHoje(0, abertaEm);

export type NovaSolicitacaoDoTime = {
  workspaceId: string;
  projectId: string;
  user: { id: string; email?: string | null };
  name: string;
  priority?: string;
  descriptionHtml?: string;
  entityId?: string | null;
  /** Módulo do sistema, já conferido por `findErrosDaSolicitacao`. */
  moduleId?: string | null;
  assigneeIds?: string[];
  /** De onde o chamado veio, quando não foi digitado na tela (ex.: "chat" + id da conversa). */
  externalSource?: string;
  externalId?: string;
  headers?: Record<string, string | undefined>;
  auditMetadata?: Record<string, unknown>;
  /**
   * Nasce com o Atendimento (status -3), atribuída a este atendente, e só ele é
   * avisado; a Qualidade fica sabendo quando ele encaminhar. Sem isto, nasce na
   * triagem e avisa a Qualidade.
   */
  atendenteId?: string;
};

type EntradaDaSolicitacao = {
  status: number;
  responsaveis: (dados: NovaSolicitacaoDoTime) => string[];
  avisar: (dados: NovaSolicitacaoDoTime, issue: { id: string; name: string; priority: string | null }) => Promise<void>;
};

/** Onde a solicitação nasce: na triagem da Qualidade ou com um atendente. */
const ENTRADAS_DA_SOLICITACAO: Record<"triagem" | "atendimento", EntradaDaSolicitacao> = {
  triagem: {
    status: -2,
    // Quem abriu fica atribuído (mais os responsáveis informados), como na criação do chamado.
    responsaveis: (dados) => [dados.user.id, ...(dados.assigneeIds ?? [])],
    avisar: (dados, issue) =>
      notifyQualityOfIntake({
        workspaceId: dados.workspaceId,
        projectId: dados.projectId,
        issueId: issue.id,
        actorId: dados.user.id,
        issueName: issue.name,
        priority: issue.priority,
      }),
  },
  atendimento: {
    status: -3,
    responsaveis: (dados) => [dados.atendenteId as string],
    avisar: (dados, issue) =>
      notifyAtendenteDaSolicitacao({
        workspaceId: dados.workspaceId,
        projectId: dados.projectId,
        issueId: issue.id,
        actorId: dados.user.id,
        receiverId: dados.atendenteId as string,
        issueName: issue.name,
      }),
  },
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
  const entrada = ENTRADAS_DA_SOLICITACAO[dados.atendenteId ? "atendimento" : "triagem"];
  const triageState = await findTriageState(projectId);
  const issue = await prisma.issue.create({
    data: {
      projectId,
      workspaceId,
      sequenceId: await nextSequenceId(prisma, projectId),
      name: dados.name,
      stateId: triageState?.id ?? null,
      priority: dados.priority ?? "none",
      startDate: buildInicioDaSolicitacao(),
      isDraft: false,
      createdById: user.id,
      ...(dados.descriptionHtml !== undefined
        ? { descriptionHtml: dados.descriptionHtml, descriptionStripped: dados.descriptionHtml.replace(/<[^>]+>/g, "") }
        : {}),
      ...(dados.entityId ? { entityId: dados.entityId } : {}),
      ...(dados.externalSource ? { externalSource: dados.externalSource, externalId: dados.externalId ?? null } : {}),
    },
  });
  // A solicitação é o chamado: nasce com o mesmo "criou" que o chamado aberto no quadro.
  await recordActivities({ issueId: issue.id, workspaceId, projectId, actorId: user.id }, [
    { verb: "created", field: "issue", comment: "created the work item" },
  ]);
  if (dados.moduleId)
    await prisma.moduleIssue.create({ data: { moduleId: dados.moduleId, issueId: issue.id, projectId, workspaceId } });
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
      status: entrada.status,
      source: "in-app",
      createdById: user.id,
    },
  });
  const assigneeSet = new Set<string>(entrada.responsaveis(dados));
  await prisma.issueAssignee.createMany({
    data: Array.from(assigneeSet).map((uid) => ({ issueId: issue.id, assigneeId: uid, workspaceId, projectId })),
    skipDuplicates: true,
  });
  await markChamadoNaoLido({ issueId: issue.id, actorId: user.id });
  await entrada.avisar(dados, issue);
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
