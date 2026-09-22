/**
 * O cliente age sobre a solicitação que abriu: responde, encerra, reabre e
 * avalia. Paridade com o Service Desk do `suporte/` antigo.
 *
 * Quem pode o quê é decidido UMA vez, em `readAcoesDoCliente`; aqui cada ação
 * confere com ela antes de gravar, e a página desenha os botões com o mesmo
 * resultado. O que o cliente escreve vira comentário do chamado com a marca
 * `portal_cliente` (ver `@modules/portal/conversa`), e quem trabalha no chamado
 * é avisado no sino.
 *
 * Mudança de estado feita pelo cliente não passa pela matriz de transições: a
 * matriz é por função, e o cliente não tem função. O destino é fixo e
 * conservador (Concluído ao encerrar, Em Análise ao reabrir) e fica gravado na
 * trilha do chamado sem autor, com o comentário do cliente ao lado.
 */

import prisma from "@db";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, recordAudit } from "@utils/audit";
import { acompanharSolicitacao } from "@utils/atendimento-da-solicitacao";
import type { HttpError } from "@utils/field-error";
import { notifyInteracaoDoCliente } from "@utils/notifications";
import { publishRealtime } from "@utils/realtime";
import type { ContaDoPortal } from "@modules/portal/conta";
import { isUuid } from "@modules/portal/conta";
import { AVALIACAO_VIGENTE_INCLUDE } from "@modules/portal/avaliacao";
import { MARCA_DO_CLIENTE, TIPOS_DE_INTERACAO, type TipoDeInteracao } from "@modules/portal/conversa";
import {
  buildErrosDeCampo,
  pickEstadoDeEncerramento,
  pickEstadoDeReabertura,
  readAcoesDoCliente,
  readAvaliacao,
  readTextoDaInteracao,
  type AcoesDoCliente,
  type EstadoDoProjeto,
} from "@modules/portal/regras-do-cliente";
import { archiveRespostaVigente, DISPENSADA, MARCA_DA_RESPOSTA } from "@modules/portal/resposta";
import { SOLICITACAO_INCLUDE, serializar } from "@modules/portal/solicitacoes";

type Cabecalhos = Record<string, string | undefined>;
type Corpo = Record<string, unknown>;

const LIMITE_DO_MOTIVO = 2000;

const NAO_ENCONTRADA: HttpError = { status: 404, message: "Solicitação não encontrada." };

/** O que cada ação responde quando a solicitação não está no ponto certo. */
const FORA_DE_HORA: Record<keyof AcoesDoCliente, string> = {
  responder: "Esta solicitação não recebe mais respostas. Se o problema voltou, reabra a solicitação.",
  encerrar: "Esta solicitação já está encerrada.",
  reabrir: "Só dá para reabrir uma solicitação concluída.",
  avaliar: "A avaliação fica disponível quando a solicitação é concluída, uma vez por conclusão.",
};

/** Título do aviso no sino de quem trabalha no chamado. */
const AVISO_POR_TIPO: Record<TipoDeInteracao, string> = {
  [TIPOS_DE_INTERACAO.INTERACAO]: "O cliente respondeu",
  [TIPOS_DE_INTERACAO.REABERTURA]: "O cliente reabriu a solicitação",
  [TIPOS_DE_INTERACAO.ENCERRAMENTO]: "O cliente encerrou a solicitação",
};

type Chamado = {
  id: string;
  name: string;
  projectId: string;
  workspaceId: string;
  state: { id: string; name: string; group: string } | null;
};

type Solicitacao = { chamado: Chamado; conta: ContaDoPortal; acoes: AcoesDoCliente };

/**
 * A solicitação da conta, com o que ela permite agora. `404` também quando é
 * de outra conta: dizer 403 confirmaria que existe.
 */
async function findSolicitacaoDaConta(conta: ContaDoPortal, issueId: string): Promise<Solicitacao> {
  if (!isUuid(issueId)) throw NAO_ENCONTRADA;
  const pedido = await prisma.portalRequest.findFirst({
    where: { accountId: conta.id, issueId, issue: { deletedAt: null } },
    select: {
      issue: {
        select: {
          id: true,
          name: true,
          projectId: true,
          workspaceId: true,
          state: { select: { id: true, name: true, group: true } },
          intakeIssues: {
            where: { deletedAt: null },
            select: { status: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          portalEvaluations: { ...AVALIACAO_VIGENTE_INCLUDE, select: { id: true } },
        },
      },
    },
  });
  if (!pedido?.issue) throw NAO_ENCONTRADA;
  const { intakeIssues, portalEvaluations, ...chamado } = pedido.issue;
  const acoes = readAcoesDoCliente({
    intakeStatus: intakeIssues[0]?.status ?? -2,
    grupo: chamado.state?.group ?? "triage",
    avaliada: portalEvaluations.length > 0,
  });
  return { chamado, conta, acoes };
}

function requireAcao(solicitacao: Solicitacao, acao: keyof AcoesDoCliente): void {
  if (solicitacao.acoes[acao]) return;
  throw { status: 409, message: FORA_DE_HORA[acao] } satisfies HttpError;
}

/** A solicitação como a página a lê, depois da ação. */
async function readSolicitacaoAtualizada(conta: ContaDoPortal, issueId: string) {
  const pedido = await prisma.portalRequest.findFirstOrThrow({
    where: { accountId: conta.id, issueId },
    include: SOLICITACAO_INCLUDE,
  });
  return serializar(pedido);
}

/** Grava o que o cliente escreveu como comentário do chamado e avisa a equipe. */
async function saveComentarioDoCliente(
  { chamado, conta }: Solicitacao,
  tipo: TipoDeInteracao,
  texto: { html: string; texto: string }
) {
  const comentario = await prisma.issueComment.create({
    data: {
      issueId: chamado.id,
      workspaceId: chamado.workspaceId,
      projectId: chamado.projectId,
      actorId: null,
      createdById: null,
      commentHtml: texto.html,
      commentStripped: texto.texto,
      access: "EXTERNAL",
      externalSource: MARCA_DO_CLIENTE,
      externalId: tipo,
    },
  });
  publishRealtime(chamado.workspaceId, {
    entity: "comment",
    action: "create",
    project_id: chamado.projectId,
    issue_id: chamado.id,
    id: comentario.id,
  });
  await notifyInteracaoDoCliente({
    workspaceId: chamado.workspaceId,
    projectId: chamado.projectId,
    issueId: chamado.id,
    title: AVISO_POR_TIPO[tipo],
    message: `${conta.name}: ${texto.texto}`,
    tipo,
  }).catch((erro) => console.error("[portal] falha ao avisar a equipe:", erro));
  return comentario;
}

/** Trilha LGPD: o que o cliente fez, sem o texto que ele escreveu. */
function recordAcaoDoCliente(solicitacao: Solicitacao, acao: string, headers?: Cabecalhos, extra: object = {}) {
  recordAudit({
    workspaceId: solicitacao.chamado.workspaceId,
    entity: AUDIT_ENTITIES.ISSUE,
    entityId: solicitacao.chamado.id,
    action: AUDIT_ACTIONS.UPDATE,
    actor: { id: solicitacao.conta.id, email: solicitacao.conta.email },
    headers,
    metadata: { origem: "portal", acao_do_cliente: acao, project_id: solicitacao.chamado.projectId, ...extra },
  });
}

async function findEstadosDoProjeto(projectId: string): Promise<EstadoDoProjeto[]> {
  return prisma.state.findMany({
    where: { projectId, deletedAt: null },
    select: { id: true, name: true, group: true, sequence: true, default: true },
  });
}

/**
 * Leva o chamado ao estado escolhido para a ação do cliente, com a trilha e a
 * solicitação acompanhando (atendida ao concluir, aceita ao reabrir).
 */
async function moveChamado(chamado: Chamado, destino: EstadoDoProjeto, comentario: string) {
  const concluiu = destino.group === "completed";
  await prisma.$transaction(async (tx) => {
    await tx.issue.update({
      where: { id: chamado.id },
      data: { stateId: destino.id, completedAt: concluiu ? new Date() : null },
    });
    await tx.issueActivity.create({
      data: {
        issueId: chamado.id,
        workspaceId: chamado.workspaceId,
        projectId: chamado.projectId,
        actorId: null,
        verb: "updated",
        field: "state",
        oldValue: chamado.state?.name ?? null,
        newValue: destino.name,
        comment: comentario,
        epoch: Date.now(),
      },
    });
  });
  await acompanharSolicitacao({
    issueId: chamado.id,
    grupo: destino.group,
    autorId: null,
    workspaceId: chamado.workspaceId,
    projectId: chamado.projectId,
  });
  publishRealtime(chamado.workspaceId, {
    entity: "issue",
    action: "update",
    project_id: chamado.projectId,
    id: chamado.id,
  });
}

function requireEstado(estado: EstadoDoProjeto | null): EstadoDoProjeto {
  if (estado) return estado;
  // Projeto sem o estado de destino é configuração quebrada, não erro do cliente.
  throw { status: 409, message: "Não foi possível concluir agora. Fale com o suporte." } satisfies HttpError;
}

function readMotivo(corpo: Corpo): string {
  return String(corpo.motivo ?? "")
    .trim()
    .slice(0, LIMITE_DO_MOTIVO);
}

/** Texto puro vindo de um campo simples, no formato de comentário. */
function buildTextoSimples(prefixo: string, motivo: string) {
  const texto = motivo ? `${prefixo} ${motivo}` : prefixo;
  const escapado = texto.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return { html: `<p>${escapado}</p>`, texto };
}

// ── As quatro ações ──────────────────────────────────────────────────────────

/** Nova interação: o cliente responde a uma solicitação em andamento. */
export async function createInteracao(conta: ContaDoPortal, issueId: string, corpo: Corpo, headers?: Cabecalhos) {
  const solicitacao = await findSolicitacaoDaConta(conta, issueId);
  requireAcao(solicitacao, "responder");
  const texto = readTextoDaInteracao(corpo.texto_html);
  if (!texto) throw buildErrosDeCampo([{ path: "texto_html", message: "Escreva a sua resposta." }]);

  const comentario = await saveComentarioDoCliente(solicitacao, TIPOS_DE_INTERACAO.INTERACAO, texto);
  recordAcaoDoCliente(solicitacao, "responder", headers, {
    comentario_id: comentario.id,
    caracteres: texto.texto.length,
  });
  return {
    id: comentario.id,
    autor: "cliente" as const,
    tipo: TIPOS_DE_INTERACAO.INTERACAO,
    nome: conta.name,
    texto_html: comentario.commentHtml,
    enviada_em: comentario.createdAt.toISOString(),
  };
}

/**
 * "Já resolvi": o chamado vai para Concluído e a solicitação é atendida.
 *
 * A resposta da equipe fica dispensada no mesmo passo (marca de
 * `@modules/portal/resposta`): o cliente disse que resolveu, e cobrar um
 * retorno da equipe depois disso seria ruído.
 */
export async function closeSolicitacao(conta: ContaDoPortal, issueId: string, corpo: Corpo, headers?: Cabecalhos) {
  const solicitacao = await findSolicitacaoDaConta(conta, issueId);
  requireAcao(solicitacao, "encerrar");
  const destino = requireEstado(pickEstadoDeEncerramento(await findEstadosDoProjeto(solicitacao.chamado.projectId)));
  const motivo = readMotivo(corpo);

  await moveChamado(solicitacao.chamado, destino, "encerrada pelo cliente no portal");
  await prisma.issueActivity.create({
    data: {
      issueId: solicitacao.chamado.id,
      workspaceId: solicitacao.chamado.workspaceId,
      projectId: solicitacao.chamado.projectId,
      actorId: null,
      verb: "updated",
      field: MARCA_DA_RESPOSTA,
      newValue: DISPENSADA,
      oldValue: "encerrada pelo cliente",
      comment: "o cliente encerrou a solicitação",
      epoch: Date.now(),
    },
  });
  await saveComentarioDoCliente(
    solicitacao,
    TIPOS_DE_INTERACAO.ENCERRAMENTO,
    buildTextoSimples("Encerrei a solicitação.", motivo)
  );
  recordAcaoDoCliente(solicitacao, "encerrar", headers, { estado: destino.name });
  return readSolicitacaoAtualizada(conta, issueId);
}

/**
 * Reabre a solicitação concluída, com motivo obrigatório.
 *
 * A resposta e a avaliação vigentes viram histórico: a próxima conclusão pede
 * resposta da equipe e avaliação do cliente de novo.
 */
export async function reopenSolicitacao(conta: ContaDoPortal, issueId: string, corpo: Corpo, headers?: Cabecalhos) {
  const solicitacao = await findSolicitacaoDaConta(conta, issueId);
  requireAcao(solicitacao, "reabrir");
  const motivo = readMotivo(corpo);
  if (!motivo)
    throw buildErrosDeCampo([{ path: "motivo", message: "Conte por que a solicitação precisa ser reaberta." }]);
  const destino = requireEstado(pickEstadoDeReabertura(await findEstadosDoProjeto(solicitacao.chamado.projectId)));

  await prisma.$transaction(async (tx) => {
    await archiveRespostaVigente(tx, solicitacao.chamado.id);
    await tx.portalEvaluation.updateMany({
      where: { issueId: solicitacao.chamado.id, supersededAt: null },
      data: { supersededAt: new Date() },
    });
  });
  await moveChamado(solicitacao.chamado, destino, "reaberta pelo cliente no portal");
  await saveComentarioDoCliente(
    solicitacao,
    TIPOS_DE_INTERACAO.REABERTURA,
    buildTextoSimples("Reabri a solicitação:", motivo)
  );
  recordAcaoDoCliente(solicitacao, "reabrir", headers, { estado: destino.name });
  return readSolicitacaoAtualizada(conta, issueId);
}

/** Avaliação do atendimento, uma por conclusão. */
export async function saveAvaliacao(conta: ContaDoPortal, issueId: string, corpo: Corpo, headers?: Cabecalhos) {
  const solicitacao = await findSolicitacaoDaConta(conta, issueId);
  requireAcao(solicitacao, "avaliar");
  const avaliacao = readAvaliacao(corpo);
  const { chamado } = solicitacao;

  await prisma.portalEvaluation.create({
    data: {
      workspaceId: chamado.workspaceId,
      projectId: chamado.projectId,
      issueId: chamado.id,
      accountId: conta.id,
      serviceRating: avaliacao.notaAtendimento,
      expectation: avaliacao.expectativa,
      comment: avaliacao.comentario,
    },
  });
  publishRealtime(chamado.workspaceId, {
    entity: "issue",
    action: "update",
    project_id: chamado.projectId,
    id: chamado.id,
  });
  recordAcaoDoCliente(solicitacao, "avaliar", headers, {
    nota_atendimento: avaliacao.notaAtendimento,
    expectativa: avaliacao.expectativa,
  });
  return readSolicitacaoAtualizada(conta, issueId);
}
