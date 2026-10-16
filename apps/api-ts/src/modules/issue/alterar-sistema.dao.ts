/**
 * DAO do "Alterar sistema": lê o chamado inteiro e grava a mudança. As leituras
 * usam o cliente global; a gravação recebe o `tx` da transação do service, para
 * que o chamado novo, o antigo cancelado, a relação e o histórico entrem juntos
 * ou não entrem.
 *
 * Toda decisão (etapa, etiquetas, recusas) vive em `alterar-sistema.rules.ts`.
 */
import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import prisma from "@db";
import type { EtapaDoSistema, PlanoDeEtiquetas } from "@modules/issue/alterar-sistema.rules";
import type { ActivityChange } from "@utils/activity";
import { nextSequenceId } from "@utils/sequence";

type Tx = Prisma.TransactionClient;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CHAMADO_PARA_MOVER_INCLUDE = {
  state: { select: { name: true, group: true } },
  project: { select: { identifier: true } },
  labels: {
    where: { deletedAt: null, label: { deletedAt: null } },
    select: { label: { select: { name: true, color: true } } },
  },
  assignees: { where: { deletedAt: null }, select: { assigneeId: true } },
  comments: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
  attachments: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
  versions: { orderBy: { lastSavedAt: "asc" } },
} as const;

export type ChamadoParaMover = Prisma.IssueGetPayload<{ include: typeof CHAMADO_PARA_MOVER_INCLUDE }>;

export const findChamadoParaMover = (issueId: string, projectId: string, workspaceId: string) =>
  prisma.issue.findFirst({
    where: { id: issueId, projectId, workspaceId, deletedAt: null },
    include: CHAMADO_PARA_MOVER_INCLUDE,
  });

export const findEtapasDoSistema = (projectId: string): Promise<EtapaDoSistema[]> =>
  prisma.state.findMany({
    where: { projectId, deletedAt: null },
    select: { id: true, name: true, group: true, default: true, sequence: true },
  });

export const findEtiquetasDoSistema = (projectId: string) =>
  prisma.label.findMany({ where: { projectId, deletedAt: null }, select: { id: true, name: true } });

export const findIdentificadorDoSistema = async (projectId: string) =>
  (await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { identifier: true } })).identifier;

/** Os arquivos dos anexos. Anexo migrado do SAC pode guardar um caminho em vez do id do arquivo. */
export const findArquivosDosAnexos = (assets: string[]) => {
  const ids = assets.filter((a) => UUID.test(a));
  return ids.length ? prisma.fileAsset.findMany({ where: { id: { in: ids } } }) : Promise.resolve([]);
};

export const hasSolicitacao = async (issueId: string) =>
  (await prisma.intakeIssue.count({ where: { issueId, deletedAt: null } })) > 0;

type ArquivoDoAnexo = Awaited<ReturnType<typeof findArquivosDosAnexos>>[number];

export type CopiaDeArquivo = { de: string; para: string };

export type Mudanca = {
  antigo: ChamadoParaMover;
  destinoId: string;
  etapaInicialId: string | null;
  etapaCanceladaId: string;
  etiquetas: PlanoDeEtiquetas;
  arquivos: ArquivoDoAnexo[];
  intakeDoDestinoId: string | null;
  relacao: string;
  atorId: string;
  /** Histórico de cada lado; a sequência do novo só existe dentro da transação. */
  buildHistorico: (sequenceIdDoNovo: number) => { antigo: ActivityChange[]; novo: ActivityChange[] };
};

const createChamadoNovo = async (tx: Tx, m: Mudanca, sequenceId: number) => {
  const a = m.antigo;
  return tx.issue.create({
    data: {
      projectId: m.destinoId,
      workspaceId: a.workspaceId,
      sequenceId,
      name: a.name,
      descriptionHtml: a.descriptionHtml,
      descriptionStripped: a.descriptionStripped,
      descriptionJson: (a.descriptionJson ?? undefined) as Prisma.InputJsonValue | undefined,
      priority: a.priority,
      sortOrder: a.sortOrder,
      point: a.point,
      stateId: m.etapaInicialId,
      entityId: a.entityId,
      startDate: a.startDate,
      targetDate: a.targetDate,
      legacyTicketNumber: a.legacyTicketNumber,
      // O número anual vai junto: é o número que o cliente conhece.
      ticketSequence: a.ticketSequence,
      ticketYear: a.ticketYear,
      externalSource: a.externalSource,
      externalId: a.externalId,
      createdById: a.createdById,
      updatedById: m.atorId,
    },
  });
};

async function saveEtiquetas(tx: Tx, m: Mudanca, issueId: string) {
  const criadas = m.etiquetas.criar.length
    ? await tx.label.createManyAndReturn({
        data: m.etiquetas.criar.map((l) => ({
          name: l.name,
          color: l.color,
          projectId: m.destinoId,
          workspaceId: m.antigo.workspaceId,
          createdById: m.atorId,
        })),
        select: { id: true },
      })
    : [];
  const labelIds = [...m.etiquetas.existentes, ...criadas.map((l) => l.id)];
  if (!labelIds.length) return;
  await tx.issueLabel.createMany({
    data: labelIds.map((labelId) => ({ issueId, labelId, projectId: m.destinoId, workspaceId: m.antigo.workspaceId })),
  });
}

async function saveResponsaveis(tx: Tx, m: Mudanca, issueId: string) {
  if (!m.antigo.assignees.length) return;
  await tx.issueAssignee.createMany({
    data: m.antigo.assignees.map(({ assigneeId }) => ({
      issueId,
      assigneeId,
      projectId: m.destinoId,
      workspaceId: m.antigo.workspaceId,
    })),
  });
}

/** Comentários com autor, data e visibilidade originais; a resposta continua presa ao pai copiado. */
async function saveComentarios(tx: Tx, m: Mudanca, issueId: string) {
  const comentarios = m.antigo.comments;
  if (!comentarios.length) return;
  const idNovo = new Map(comentarios.map((c) => [c.id, randomUUID()]));
  await tx.issueComment.createMany({
    data: comentarios.map((c) => ({
      id: idNovo.get(c.id)!,
      issueId,
      projectId: m.destinoId,
      workspaceId: m.antigo.workspaceId,
      actorId: c.actorId,
      createdById: c.createdById,
      updatedById: c.updatedById,
      parentId: c.parentId ? (idNovo.get(c.parentId) ?? null) : null,
      commentHtml: c.commentHtml,
      commentStripped: c.commentStripped,
      commentJson: (c.commentJson ?? undefined) as Prisma.InputJsonValue | undefined,
      access: c.access,
      editedAt: c.editedAt,
      externalSource: c.externalSource,
      externalId: c.externalId,
      createdAt: c.createdAt,
    })),
  });
}

async function saveVersoes(tx: Tx, m: Mudanca, issueId: string) {
  if (!m.antigo.versions.length) return;
  await tx.issueVersion.createMany({
    data: m.antigo.versions.map((v) => ({
      issueId,
      projectId: m.destinoId,
      workspaceId: m.antigo.workspaceId,
      ownedById: v.ownedById,
      lastSavedAt: v.lastSavedAt,
      createdAt: v.createdAt,
      name: v.name,
      descriptionHtml: v.descriptionHtml,
      descriptionJson: (v.descriptionJson ?? undefined) as Prisma.InputJsonValue | undefined,
      priority: v.priority,
      startDate: v.startDate,
      targetDate: v.targetDate,
      isDraft: v.isDraft,
      // A etapa gravada na versão é do sistema antigo: no destino não diz nada.
      stateId: null,
    })),
  });
}

/**
 * Anexos: registro novo para cada um, e arquivo novo quando o anexo aponta para
 * um `file_assets`. O binário é copiado DEPOIS da transação (storage não volta
 * atrás num rollback); por isso a função devolve os pares a copiar.
 */
async function saveAnexos(tx: Tx, m: Mudanca, issueId: string): Promise<CopiaDeArquivo[]> {
  const arquivoPorId = new Map(m.arquivos.map((f) => [f.id, f]));
  const copias: CopiaDeArquivo[] = [];
  const anexos = m.antigo.attachments.map((anexo) => {
    const arquivo = arquivoPorId.get(anexo.asset);
    if (!arquivo) return { anexo, asset: anexo.asset };
    const para = randomUUID();
    copias.push({ de: arquivo.id, para });
    return { anexo, asset: para, arquivo };
  });
  const arquivosNovos = anexos.filter((a) => a.arquivo);
  if (arquivosNovos.length)
    await tx.fileAsset.createMany({
      data: arquivosNovos.map(({ asset, arquivo }) => ({
        id: asset,
        workspaceId: m.antigo.workspaceId,
        projectId: m.destinoId,
        entityType: arquivo!.entityType,
        entityId: issueId,
        asset: arquivo!.asset,
        size: arquivo!.size,
        mimeType: arquivo!.mimeType,
        attributes: arquivo!.attributes as Prisma.InputJsonValue,
        isUploaded: arquivo!.isUploaded,
      })),
    });
  if (anexos.length)
    await tx.issueAttachment.createMany({
      data: anexos.map(({ anexo, asset }) => ({
        issueId,
        projectId: m.destinoId,
        workspaceId: m.antigo.workspaceId,
        asset,
        attributes: anexo.attributes as Prisma.InputJsonValue,
        externalSource: anexo.externalSource,
        externalId: anexo.externalId,
      })),
    });
  return copias;
}

/** O antigo vai para Cancelados e aponta para o novo. A conversa do chat passa a ser do novo. */
const saveAntigoCancelado = (tx: Tx, m: Mudanca, novoId: string) =>
  tx.issue.update({
    where: { id: m.antigo.id },
    data: {
      stateId: m.etapaCanceladaId,
      movedToIssueId: novoId,
      externalSource: null,
      externalId: null,
      updatedById: m.atorId,
    },
  });

/** A solicitação de origem e o pedido do portal acompanham o chamado novo. */
async function moveSolicitacao(tx: Tx, m: Mudanca, novoId: string) {
  await tx.intakeIssue.updateMany({
    where: { issueId: m.antigo.id, deletedAt: null },
    data: {
      issueId: novoId,
      projectId: m.destinoId,
      ...(m.intakeDoDestinoId ? { intakeId: m.intakeDoDestinoId } : {}),
    },
  });
  await tx.portalRequest.updateMany({ where: { issueId: m.antigo.id }, data: { issueId: novoId } });
}

const saveRelacao = (tx: Tx, m: Mudanca, novoId: string) =>
  tx.issueRelation.create({
    data: {
      issueId: m.antigo.id,
      relatedIssueId: novoId,
      projectId: m.antigo.projectId,
      workspaceId: m.antigo.workspaceId,
      relationType: m.relacao,
    },
  });

const buildAtividades = (
  escopo: { issueId: string; projectId: string; workspaceId: string; actorId: string },
  mudancas: ActivityChange[]
) =>
  mudancas.map((c) => ({
    ...escopo,
    verb: c.verb ?? "updated",
    field: c.field,
    oldValue: c.oldValue ?? null,
    newValue: c.newValue ?? null,
    comment: c.comment ?? "",
    epoch: Date.now(),
  }));

async function saveHistorico(tx: Tx, m: Mudanca, novo: { id: string; sequenceId: number }) {
  const historico = m.buildHistorico(novo.sequenceId);
  const comum = { workspaceId: m.antigo.workspaceId, actorId: m.atorId };
  await tx.issueActivity.createMany({
    data: [
      ...buildAtividades({ ...comum, issueId: m.antigo.id, projectId: m.antigo.projectId }, historico.antigo),
      ...buildAtividades({ ...comum, issueId: novo.id, projectId: m.destinoId }, historico.novo),
    ],
  });
}

/** Grava a mudança inteira na transação recebida. */
export async function saveMudanca(tx: Tx, m: Mudanca) {
  const sequenceId = await nextSequenceId(tx, m.destinoId);
  const novo = await createChamadoNovo(tx, m, sequenceId);
  await saveEtiquetas(tx, m, novo.id);
  await saveResponsaveis(tx, m, novo.id);
  await saveComentarios(tx, m, novo.id);
  await saveVersoes(tx, m, novo.id);
  const copias = await saveAnexos(tx, m, novo.id);
  await saveAntigoCancelado(tx, m, novo.id);
  await moveSolicitacao(tx, m, novo.id);
  await saveRelacao(tx, m, novo.id);
  await saveHistorico(tx, m, novo);
  return { novo, copias };
}

export const alterarSistemaDao = {
  findChamadoParaMover,
  findEtapasDoSistema,
  findEtiquetasDoSistema,
  findIdentificadorDoSistema,
  findArquivosDosAnexos,
  hasSolicitacao,
  saveMudanca,
};

export type AlterarSistemaDao = typeof alterarSistemaDao;
