/**
 * A situação de uma solicitação como as Solicitações globais a mostram.
 *
 * Além dos status gravados (-2 pendente, -1 recusada, 0 adiada, 1 aceita,
 * 2 duplicada), existe a situação "concluido": a solicitação cujo chamado já
 * terminou. Concluir o chamado marca a solicitação como atendida (3, ver
 * `@utils/atendimento-da-solicitacao`); a aceita cujo chamado está numa etapa do
 * grupo `completed` é o mesmo caso, gravado antes dessa marcação automática.
 * Por isso a aba "Aceito" (`status=1`) deixa essas de fora.
 *
 * O filtro do `GET /:slug/global-intake-issues/` recebe `status` com valores
 * separados por vírgula: números de status e/ou `concluido`.
 */

import type { Prisma } from "@prisma/client";

export const SITUACAO_CONCLUIDA = "concluido";

const ACEITA = 1;
const ATENDIDA = 3;
const GRUPO_CONCLUIDO = "completed";

const CHAMADO_CONCLUIDO = { issue: { state: { group: GRUPO_CONCLUIDO } } } satisfies Prisma.IntakeIssueWhereInput;

/** Filtros que não são "o status é este número". */
const FILTRO_ESPECIAL: Record<string, Prisma.IntakeIssueWhereInput> = {
  [SITUACAO_CONCLUIDA]: { OR: [{ status: ATENDIDA }, { status: ACEITA, ...CHAMADO_CONCLUIDO }] },
  [String(ACEITA)]: { status: ACEITA, NOT: CHAMADO_CONCLUIDO },
};

const isStatusNumerico = (valor: string) => /^-?\d+$/.test(valor);

const buildFiltro = (valor: string): Prisma.IntakeIssueWhereInput | null =>
  FILTRO_ESPECIAL[valor] ?? (isStatusNumerico(valor) ? { status: Number(valor) } : null);

/** `where` do Prisma para os valores do filtro `status` (qualquer um deles serve). */
export function buildFiltroDaSituacao(valores: string[]): Prisma.IntakeIssueWhereInput {
  return {
    OR: valores
      .map((valor) => buildFiltro(valor.trim()))
      .filter((filtro): filtro is Prisma.IntakeIssueWhereInput => filtro !== null),
  };
}

const isConcluida = (status: number, grupoDaEtapa: string | null) =>
  status === ATENDIDA || (status === ACEITA && grupoDaEtapa === GRUPO_CONCLUIDO);

/** A situação de uma solicitação: `concluido` ou o próprio status, em texto. */
export function readSituacao(status: number, grupoDaEtapa: string | null): string {
  return isConcluida(status, grupoDaEtapa) ? SITUACAO_CONCLUIDA : String(status);
}

/**
 * Solicitação resolvida que ainda espera o "atendido": o chamado terminou, mas
 * a solicitação não foi marcada como atendida (3). É o número que o menu
 * Solicitação/Triagem mostra para quem abriu o pedido. Mesmo recorte da aba
 * Concluído, menos as já atendidas.
 */
export const FILTRO_RESOLVIDA_PARA_ATENDER: Prisma.IntakeIssueWhereInput = {
  AND: [buildFiltroDaSituacao([SITUACAO_CONCLUIDA]), { NOT: { status: ATENDIDA } }],
};
