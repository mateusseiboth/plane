/**
 * As solicitações abertas pelo cliente no portal.
 *
 * Abrir uma solicitação aqui é o MESMO caminho do `POST /inbox-issues/` do
 * produto: nasce na triagem, entra na caixa de entrada do projeto e a equipe
 * decide. O que muda é só a origem — `source: "portal"` — e o fato de não haver
 * usuário do Plane por trás: `createdById` fica nulo, e quem abriu está em
 * `portal_requests`.
 *
 * O cliente lê exclusivamente o que ele mesmo abriu. Não há filtro por projeto
 * nem por entidade nesta leitura de propósito: o vínculo com a conta é a única
 * chave, e é o que impede uma solicitação de vazar para o cliente errado.
 */

import prisma from "@db";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, recordAudit } from "@utils/audit";
import { findOrCreateIntake, findTriageState } from "@utils/intake";
import { notifyQualityOfIntake } from "@utils/notifications";
import { publishRealtime } from "@utils/realtime";
import { nextSequenceId } from "@utils/sequence";
import type { ContaDoPortal } from "@modules/portal/conta";
import { ehUuid } from "@modules/portal/conta";
import { anexoDoChamado } from "@modules/portal/anexos";
import { RESPOSTA_INCLUDE, serializarResposta } from "@modules/portal/resposta";
import { situacaoDaSolicitacao } from "@modules/portal/situacao";
import { limparTextoDoCliente, textoSemMarcacao } from "@modules/portal/texto-rico";

/** De onde veio, para a equipe distinguir da abertura feita pelo time. */
const ORIGEM = "portal";

const LIMITE = { titulo: 250 } as const;

const SOLICITACAO_INCLUDE = {
  issue: {
    include: {
      state: { select: { name: true, group: true, color: true, isTriage: true } },
      project: { select: { name: true, identifier: true } },
      intakeIssues: { where: { deletedAt: null }, select: { status: true }, orderBy: { createdAt: "desc" }, take: 1 },
      // A resposta que a equipe escreveu ao concluir. Ver @modules/portal/resposta.
      comments: RESPOSTA_INCLUDE,
      // Os arquivos que o cliente anexou. Ver @modules/portal/anexos.
      attachments: {
        where: { deletedAt: null },
        select: { id: true, attributes: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  },
} as const;

function texto(valor: unknown, limite: number): string {
  return String(valor ?? "")
    .trim()
    .slice(0, limite);
}

/** O chamado como o cliente o vê: sem responsável, sem etiqueta, sem histórico interno. */
function serializar(pedido: any) {
  const chamado = pedido.issue;
  const intakeStatus = chamado.intakeIssues[0]?.status ?? -2;
  const situacao = situacaoDaSolicitacao({ intakeStatus, estado: chamado.state });
  return {
    id: chamado.id,
    codigo: `${chamado.project?.identifier ?? ""}-${chamado.sequenceId}`,
    titulo: chamado.name,
    sistema: chamado.project?.name ?? "",
    descricao_html: chamado.descriptionHtml ?? "<p></p>",
    situacao: situacao.rotulo,
    grupo: situacao.grupo,
    resposta: serializarResposta(chamado.comments),
    anexos: (chamado.attachments ?? []).map(anexoDoChamado),
    aberta_em: chamado.createdAt?.toISOString() ?? null,
    atualizada_em: chamado.updatedAt?.toISOString() ?? null,
  };
}

export type NovaSolicitacao = { titulo: unknown; descricao_html: unknown };

/**
 * Abre a solicitação na triagem do sistema escolhido.
 *
 * `sistema` já vem conferido por `sistemaLiberado`: o acesso é decidido antes,
 * e aqui nada mais pergunta se pode.
 */
export async function abrirSolicitacao(
  conta: ContaDoPortal,
  sistema: { id: string; workspaceId: string },
  dados: NovaSolicitacao,
  headers?: Record<string, string | undefined>
) {
  const titulo = texto(dados.titulo, LIMITE.titulo);
  // O texto vem de um editor no navegador do CLIENTE: só entra depois de limpo.
  const descricaoHtml = limparTextoDoCliente(dados.descricao_html);
  const triagem = await findTriageState(sistema.id);

  const pedido = await prisma.$transaction(async (tx) => {
    const chamado = await tx.issue.create({
      data: {
        projectId: sistema.id,
        workspaceId: sistema.workspaceId,
        sequenceId: await nextSequenceId(tx, sistema.id),
        name: titulo,
        stateId: triagem?.id ?? null,
        descriptionHtml: descricaoHtml,
        descriptionStripped: textoSemMarcacao(descricaoHtml),
        // Ninguém do time abriu isto: quem abriu está em `portal_requests`.
        createdById: null,
        entityId: conta.entityId,
      },
    });
    const intake = await findOrCreateIntake(sistema.id, sistema.workspaceId);
    await tx.intakeIssue.create({
      data: {
        intakeId: intake.id,
        issueId: chamado.id,
        workspaceId: sistema.workspaceId,
        projectId: sistema.id,
        status: -2,
        source: ORIGEM,
      },
    });
    await tx.portalRequest.create({ data: { accountId: conta.id, issueId: chamado.id } });
    return tx.portalRequest.findFirstOrThrow({ where: { issueId: chamado.id }, include: SOLICITACAO_INCLUDE });
  });

  const chamado = pedido.issue;
  await notifyQualityOfIntake({
    workspaceId: sistema.workspaceId,
    projectId: sistema.id,
    issueId: chamado.id,
    actorId: null,
    issueName: chamado.name,
  });
  publishRealtime(sistema.workspaceId, {
    entity: "intake",
    action: "create",
    project_id: sistema.id,
    id: chamado.id,
    issue_id: chamado.id,
  });
  publishRealtime(sistema.workspaceId, { entity: "issue", action: "create", project_id: sistema.id, id: chamado.id });
  recordAudit({
    workspaceId: sistema.workspaceId,
    entity: AUDIT_ENTITIES.INTAKE,
    entityId: chamado.id,
    action: AUDIT_ACTIONS.CREATE,
    actor: { id: conta.id, email: conta.email },
    headers,
    metadata: { origem: ORIGEM, project_id: sistema.id, name: chamado.name },
  });

  return serializar(pedido);
}

/** Tudo que a conta abriu, da mais recente para a mais antiga. */
export async function solicitacoesDaConta(conta: ContaDoPortal) {
  const pedidos = await prisma.portalRequest.findMany({
    where: { accountId: conta.id, issue: { deletedAt: null } },
    include: SOLICITACAO_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return pedidos.map(serializar);
}

/**
 * O chamado por trás da solicitação, quando ela é mesmo daquela conta.
 *
 * É a checagem de dono usada por quem precisa gravar alguma coisa no chamado
 * (anexo, por exemplo) e não do texto que o cliente lê. `null` também aqui
 * quando não é dela: dizer "403" seria confirmar que a solicitação existe.
 */
export async function chamadoDaConta(
  conta: ContaDoPortal,
  issueId: string
): Promise<{ issueId: string; projectId: string; workspaceId: string } | null> {
  if (!ehUuid(issueId)) return null;
  const pedido = await prisma.portalRequest.findFirst({
    where: { accountId: conta.id, issueId, issue: { deletedAt: null } },
    select: { issue: { select: { id: true, projectId: true, workspaceId: true } } },
  });
  if (!pedido?.issue) return null;
  return { issueId: pedido.issue.id, projectId: pedido.issue.projectId, workspaceId: pedido.issue.workspaceId };
}

/** Uma solicitação da conta. `null` quando não é dela — e não 403, que confirmaria a existência. */
export async function solicitacaoDaConta(conta: ContaDoPortal, issueId: string) {
  if (!ehUuid(issueId)) return null;
  const pedido = await prisma.portalRequest.findFirst({
    where: { accountId: conta.id, issueId, issue: { deletedAt: null } },
    include: SOLICITACAO_INCLUDE,
  });
  return pedido ? serializar(pedido) : null;
}
