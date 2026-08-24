/**
 * A resposta ao cliente quando o chamado que ele abriu é concluído.
 *
 * Quem abre pelo portal some do processo: a equipe trabalha dentro do Plane e o
 * portal do cliente só mostra a etiqueta de situação. Ver "Concluído" sem uma
 * palavra é exatamente a reclamação — então, ao concluir um chamado que NASCEU
 * no portal, alguém precisa escrever o retorno.
 *
 * ## Onde a resposta mora (sem coluna nova)
 *
 * `portal_requests` liga conta ↔ chamado e não tem onde guardar texto. Em vez de
 * ganhar coluna, a resposta é um COMENTÁRIO do próprio chamado, marcado com
 * `externalSource = "portal_resposta"` e `access = "EXTERNAL"` — a mesma marca
 * de origem que `@utils/intake-replication` já usa para não duplicar cópia.
 * Vêm de graça: o texto (`commentHtml`/`commentStripped`), quem respondeu
 * (`actorId`) e quando (`createdAt`) — e a equipe lê no histórico do chamado
 * exatamente o que foi dito ao cliente, que é o que ela precisa antes de
 * responder de novo.
 *
 * "Não vou responder" é um `issue_activities` com `field = "portal_resposta"` e
 * `newValue = "dispensada"`. Campo desconhecido não desenha nada na trilha da
 * tela (o `AdditionalActivityRoot` do web devolve vazio), então serve de marca
 * silenciosa com autor e data.
 *
 * ## Por que a pendência é DERIVADA, e não gravada por quem conclui
 *
 * Concluir acontece por muitos caminhos — arrastar no quadro, trocar o estado no
 * detalhe, no peek, na planilha, pela triagem, pelo item de triagem, em massa,
 * pela API. Se a pendência fosse um carimbo gravado na conclusão, cada caminho
 * seria uma chance de esquecer o carimbo. Aqui ela é uma CONSULTA: origem
 * portal + estado do grupo `completed` + sem resposta + sem dispensa. Nenhum
 * caminho fica de fora porque nenhum caminho precisa colaborar.
 */

import prisma from "@db";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, recordAudit } from "@utils/audit";
import { publishRealtime } from "@utils/realtime";

/** Marca que separa a resposta ao cliente de qualquer outro comentário do chamado. */
export const MARCA_DA_RESPOSTA = "portal_resposta";

/** `newValue` da marca de "concluí sem responder". */
const DISPENSADA = "dispensada";

/** Grupo de estado que conta como conclusão (ver `packages/constants/src/state.ts`). */
const GRUPO_CONCLUIDO = "completed";

const LIMITE = { resposta: 20000, motivo: 500, lista: 20 } as const;

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/**
 * O que a equipe digitou vira HTML aqui, escapado.
 *
 * A resposta é conteúdo que sai da aplicação para fora: aceitar HTML pronto do
 * navegador seria aceitar marcação de terceiro no portal do cliente. O texto
 * entra como texto e a formatação se resume a parágrafo e quebra de linha.
 */
function paraHtml(texto: string): string {
  const paragrafos = texto
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!paragrafos.length) return "<p></p>";
  return paragrafos.map((p) => `<p>${escapar(p).replace(/\n/g, "<br />")}</p>`).join("");
}

/** O comentário-resposta do chamado, quando existe. */
export const RESPOSTA_INCLUDE = {
  where: { externalSource: MARCA_DA_RESPOSTA, deletedAt: null },
  orderBy: { createdAt: "desc" },
  take: 1,
  select: {
    commentHtml: true,
    commentStripped: true,
    createdAt: true,
    actor: { select: { displayName: true, firstName: true, lastName: true } },
  },
} as const;

function nomeDeQuemRespondeu(actor: { displayName: string; firstName: string; lastName: string } | null): string {
  if (!actor) return "Equipe de atendimento";
  const completo = `${actor.firstName} ${actor.lastName}`.trim();
  return actor.displayName || completo || "Equipe de atendimento";
}

/**
 * A resposta como o CLIENTE a lê: texto puro, autor e data.
 *
 * Texto puro de propósito — a página do portal não renderiza HTML de lugar
 * nenhum, e o que sai daqui é escrito por gente, não por editor.
 */
export function serializarResposta(comentarios: any[] | undefined) {
  const resposta = comentarios?.[0];
  if (!resposta) return null;
  return {
    texto: resposta.commentStripped ?? "",
    respondida_por: nomeDeQuemRespondeu(resposta.actor ?? null),
    respondida_em: resposta.createdAt?.toISOString() ?? null,
  };
}

/** Chamado concluído, de origem portal, sem resposta e sem dispensa. */
const AGUARDANDO_RESPOSTA = {
  deletedAt: null,
  archivedAt: null,
  state: { group: GRUPO_CONCLUIDO },
  comments: { none: { externalSource: MARCA_DA_RESPOSTA, deletedAt: null } },
  activities: { none: { field: MARCA_DA_RESPOSTA, newValue: DISPENSADA, deletedAt: null } },
} as const;

const PENDENTE_INCLUDE = {
  account: { select: { name: true } },
  issue: {
    select: {
      id: true,
      name: true,
      sequenceId: true,
      updatedAt: true,
      projectId: true,
      project: { select: { id: true, name: true, identifier: true } },
      state: { select: { name: true } },
    },
  },
} as const;

function serializarPendente(pedido: any) {
  const chamado = pedido.issue;
  return {
    issue_id: chamado.id,
    project_id: chamado.projectId,
    codigo: `${chamado.project?.identifier ?? ""}-${chamado.sequenceId}`,
    titulo: chamado.name,
    sistema: chamado.project?.name ?? "",
    estado: chamado.state?.name ?? "",
    cliente: pedido.account?.name ?? "",
    concluido_em: chamado.updatedAt?.toISOString() ?? null,
  };
}

/**
 * O que ESTE usuário precisa responder.
 *
 * Recorte por responsável, não pelo espaço inteiro: quem muda o estado de um
 * chamado já entra como responsável dele (ver o PATCH do chamado), então quem
 * concluiu está sempre nesta lista — e quem não tem nada a ver com o chamado
 * não recebe janela nenhuma.
 */
export async function respostasPendentes(workspaceId: string, userId: string) {
  const pedidos = await prisma.portalRequest.findMany({
    where: {
      issue: {
        ...AGUARDANDO_RESPOSTA,
        workspaceId,
        assignees: { some: { assigneeId: userId, deletedAt: null } },
      },
    },
    include: PENDENTE_INCLUDE,
    orderBy: { issue: { updatedAt: "desc" } },
    take: LIMITE.lista,
  });
  return pedidos.map(serializarPendente);
}

export type PedidoAResponder = Awaited<ReturnType<typeof pedidoAResponder>>;

/** O pedido do portal por trás de um chamado — `null` quando o chamado não nasceu no portal. */
export async function pedidoAResponder(workspaceId: string, issueId: string) {
  return prisma.portalRequest.findFirst({
    where: { issueId, issue: { workspaceId, deletedAt: null } },
    include: {
      account: { select: { id: true, name: true } },
      issue: {
        select: {
          id: true,
          name: true,
          projectId: true,
          workspaceId: true,
          state: { select: { group: true } },
        },
      },
    },
  });
}

/** Já foi respondido (ou explicitamente dispensado)? */
export async function jaResolvido(issueId: string): Promise<boolean> {
  const [resposta, dispensa] = await Promise.all([
    prisma.issueComment.findFirst({
      where: { issueId, externalSource: MARCA_DA_RESPOSTA, deletedAt: null },
      select: { id: true },
    }),
    prisma.issueActivity.findFirst({
      where: { issueId, field: MARCA_DA_RESPOSTA, newValue: DISPENSADA, deletedAt: null },
      select: { id: true },
    }),
  ]);
  return Boolean(resposta || dispensa);
}

/** O chamado está concluído? Só aí faz sentido responder ao cliente. */
export function estaConcluido(pedido: { issue: { state: { group: string } | null } }): boolean {
  return pedido.issue.state?.group === GRUPO_CONCLUIDO;
}

type Autor = { id: string; email?: string | null };

type Contexto = {
  pedido: NonNullable<PedidoAResponder>;
  autor: Autor;
  headers?: Record<string, string | undefined>;
};

/**
 * Grava a resposta ao cliente e a devolve já no formato que o portal lê.
 *
 * A resposta nasce como comentário EXTERNO do chamado: a equipe vê no histórico
 * o que foi dito para fora, e o cliente vê no portal a mesma coisa.
 */
export async function registrarResposta(ctx: Contexto & { texto: string }) {
  const { pedido, autor, headers } = ctx;
  const texto = ctx.texto.trim().slice(0, LIMITE.resposta);
  const chamado = pedido.issue;

  const comentario = await prisma.issueComment.create({
    data: {
      issueId: chamado.id,
      actorId: autor.id,
      createdById: autor.id,
      workspaceId: chamado.workspaceId,
      projectId: chamado.projectId,
      commentHtml: paraHtml(texto),
      // O texto como foi digitado, com as quebras de linha: é ele que o portal mostra.
      commentStripped: texto,
      access: "EXTERNAL",
      externalSource: MARCA_DA_RESPOSTA,
    },
    select: {
      id: true,
      commentHtml: true,
      commentStripped: true,
      createdAt: true,
      actor: { select: { displayName: true, firstName: true, lastName: true } },
    },
  });

  publishRealtime(chamado.workspaceId, {
    entity: "comment",
    action: "create",
    project_id: chamado.projectId,
    issue_id: chamado.id,
    id: comentario.id,
    actor: autor.id,
  });
  publishRealtime(chamado.workspaceId, {
    entity: "issue",
    action: "update",
    project_id: chamado.projectId,
    id: chamado.id,
    actor: autor.id,
  });

  // LGPD: conteúdo saindo da aplicação para uma pessoa de fora. Fica registrado
  // quem escreveu, para qual conta foi e o tamanho — nunca o texto em si.
  recordAudit({
    workspaceId: chamado.workspaceId,
    entity: AUDIT_ENTITIES.ISSUE,
    entityId: chamado.id,
    action: AUDIT_ACTIONS.COMMENT,
    actor: autor,
    headers,
    metadata: {
      origem: "portal",
      resposta_ao_cliente: "enviada",
      project_id: chamado.projectId,
      conta_id: pedido.accountId,
      comentario_id: comentario.id,
      caracteres: texto.length,
    },
  });

  return serializarResposta([comentario]);
}

/**
 * Registra que o chamado foi concluído SEM resposta ao cliente.
 *
 * Não é o mesmo que "ninguém perguntou": é uma decisão de alguém, com nome e
 * hora, e some da fila de pendências para não virar alarme permanente.
 */
export async function dispensarResposta(ctx: Contexto & { motivo?: string }) {
  const { pedido, autor, headers } = ctx;
  const motivo = (ctx.motivo ?? "").trim().slice(0, LIMITE.motivo);
  const chamado = pedido.issue;

  await prisma.issueActivity.create({
    data: {
      issueId: chamado.id,
      workspaceId: chamado.workspaceId,
      projectId: chamado.projectId,
      actorId: autor.id,
      verb: "updated",
      field: MARCA_DA_RESPOSTA,
      newValue: DISPENSADA,
      oldValue: motivo || null,
      comment: "concluiu sem responder ao cliente",
      epoch: Date.now(),
    },
  });

  recordAudit({
    workspaceId: chamado.workspaceId,
    entity: AUDIT_ENTITIES.ISSUE,
    entityId: chamado.id,
    action: AUDIT_ACTIONS.UPDATE,
    actor: autor,
    headers,
    metadata: {
      origem: "portal",
      resposta_ao_cliente: DISPENSADA,
      project_id: chamado.projectId,
      conta_id: pedido.accountId,
      motivo: motivo || null,
    },
  });

  return { dispensada: true as const };
}
