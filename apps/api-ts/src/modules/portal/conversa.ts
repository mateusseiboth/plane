/**
 * A conversa da solicitação no portal: o que o cliente escreveu e o que a
 * equipe respondeu para ele.
 *
 * Tudo mora em `issue_comments`, sem tabela nova, separado dos comentários
 * internos pela marca de origem (`external_source`):
 *
 *  - `portal_cliente`: o cliente escreveu (resposta, motivo da reabertura ou
 *    recado ao encerrar). `external_id` guarda o tipo. `actor_id` fica nulo:
 *    a conta do portal não é usuário do Plane.
 *  - `portal_resposta` e `portal_resposta_anterior`: a resposta da equipe ao
 *    concluir (ver `@modules/portal/resposta`).
 *
 * Comentário interno da equipe NUNCA entra aqui, qualquer que seja o `access`
 * dele: o portal só mostra o que foi escrito para o cliente.
 */

import prisma from "@db";
import { MARCA_DA_RESPOSTA, MARCA_DA_RESPOSTA_ANTERIOR } from "@modules/portal/resposta";

export const MARCA_DO_CLIENTE = "portal_cliente";

export const TIPOS_DE_INTERACAO = {
  INTERACAO: "interacao",
  REABERTURA: "reabertura",
  ENCERRAMENTO: "encerramento",
} as const;
export type TipoDeInteracao = (typeof TIPOS_DE_INTERACAO)[keyof typeof TIPOS_DE_INTERACAO];

const MARCAS_DA_CONVERSA = [MARCA_DO_CLIENTE, MARCA_DA_RESPOSTA, MARCA_DA_RESPOSTA_ANTERIOR];

export const CONVERSA_INCLUDE = {
  where: { externalSource: { in: MARCAS_DA_CONVERSA }, deletedAt: null },
  orderBy: { createdAt: "asc" },
  select: {
    id: true,
    commentHtml: true,
    commentStripped: true,
    createdAt: true,
    externalSource: true,
    externalId: true,
    actor: { select: { displayName: true, firstName: true, lastName: true } },
  },
} as const;

type Comentario = {
  id: string;
  commentHtml: string;
  commentStripped: string;
  createdAt: Date | null;
  externalSource: string | null;
  externalId: string | null;
  actor: { displayName: string; firstName: string; lastName: string } | null;
};

const EQUIPE = "Equipe de atendimento";

function nomeDaEquipe(actor: Comentario["actor"]): string {
  if (!actor) return EQUIPE;
  return actor.displayName || `${actor.firstName} ${actor.lastName}`.trim() || EQUIPE;
}

/** Nome que a EQUIPE vê no comentário do cliente, dentro do Plane. */
export const buildNomeDoClienteNoChamado = (nomeDaConta: string) => `${nomeDaConta} (cliente)`;

export function serializarInteracao(c: Comentario, nomeDaConta: string) {
  const doCliente = c.externalSource === MARCA_DO_CLIENTE;
  return {
    id: c.id,
    autor: doCliente ? ("cliente" as const) : ("equipe" as const),
    tipo: doCliente ? (c.externalId ?? TIPOS_DE_INTERACAO.INTERACAO) : "resposta",
    nome: doCliente ? nomeDaConta : nomeDaEquipe(c.actor),
    texto_html: c.commentHtml,
    enviada_em: c.createdAt?.toISOString() ?? null,
  };
}

export function serializarConversa(comentarios: Comentario[] | undefined, nomeDaConta: string) {
  return (comentarios ?? []).map((c) => serializarInteracao(c, nomeDaConta));
}

/** A resposta vigente da equipe, a mais recente primeiro (formato de `serializarResposta`). */
export function filterRespostaVigente(comentarios: Comentario[] | undefined): Comentario[] {
  return (comentarios ?? []).filter((c) => c.externalSource === MARCA_DA_RESPOSTA).toReversed();
}

/** A resposta do cliente naquele chamado, para amarrar o anexo que sobe junto. */
export async function isInteracaoDoChamado(issueId: string, interacaoId: string): Promise<boolean> {
  const comentario = await prisma.issueComment.findFirst({
    where: { id: interacaoId, issueId, externalSource: MARCA_DO_CLIENTE, deletedAt: null },
    select: { id: true },
  });
  return Boolean(comentario);
}
