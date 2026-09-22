/**
 * A avaliação que o cliente faz ao concluir, nos dois formatos: o do portal
 * (chaves em português, como o resto de `/portal/api`) e o da equipe, lido no
 * detalhe do chamado (snake_case do `/api/v1`).
 */

import { EXPECTATIVAS, NOTAS_DE_ATENDIMENTO } from "@modules/portal/regras-do-cliente";

/** Só a vigente: reabrir marca a anterior como substituída. */
export const AVALIACAO_VIGENTE_INCLUDE = {
  where: { supersededAt: null },
  orderBy: { createdAt: "desc" },
  take: 1,
} as const;

type Avaliacao = {
  id: string;
  serviceRating: number;
  expectation: number;
  comment: string | null;
  createdAt: Date;
  supersededAt: Date | null;
};

export function serializarAvaliacao(avaliacao: Avaliacao | undefined | null) {
  if (!avaliacao) return null;
  return {
    nota_atendimento: avaliacao.serviceRating,
    nota_atendimento_rotulo: NOTAS_DE_ATENDIMENTO[avaliacao.serviceRating] ?? "",
    expectativa: avaliacao.expectation,
    expectativa_rotulo: EXPECTATIVAS[avaliacao.expectation] ?? "",
    comentario: avaliacao.comment,
    avaliada_em: avaliacao.createdAt.toISOString(),
  };
}

export function serializeAvaliacaoParaEquipe(avaliacao: Avaliacao) {
  return {
    id: avaliacao.id,
    service_rating: avaliacao.serviceRating,
    service_rating_label: NOTAS_DE_ATENDIMENTO[avaliacao.serviceRating] ?? "",
    expectation: avaliacao.expectation,
    expectation_label: EXPECTATIVAS[avaliacao.expectation] ?? "",
    comment: avaliacao.comment,
    created_at: avaliacao.createdAt.toISOString(),
    is_current: avaliacao.supersededAt === null,
  };
}
