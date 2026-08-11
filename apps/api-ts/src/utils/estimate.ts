/**
 * Pontos de estimativa — leitura e soma.
 *
 * `EstimatePoint.value` é texto porque uma estimativa pode ser por categoria
 * ("P", "M", "G") em vez de por número. Somar pontos, portanto, só faz sentido
 * sobre o que for numérico: o resto entra na conta como zero, nunca como NaN.
 *
 * Não confundir com a coluna `Issue.point`, um número solto herdado do SAC que
 * continua existindo e não tem relação com estimativas.
 */
import prisma from "@db";

/** Valor numérico de um ponto de estimativa; 0 quando é categoria ou vazio. */
export function pontosDoValor(valor?: string | null): number {
  if (valor === undefined || valor === null) return 0;
  const numero = Number(String(valor).replace(",", ".").trim());
  return Number.isFinite(numero) ? numero : 0;
}

/** Soma os pontos de uma lista de valores, ignorando categorias. */
export function somarValores(valores: Array<string | null | undefined>): number {
  return valores.reduce<number>((total, valor) => total + pontosDoValor(valor), 0);
}

export type PontoDeEstimativa = {id: string; value: string; key: number; tipo: string};

/**
 * Resolve o ponto de estimativa exigindo que ele pertença a uma estimativa DO
 * MESMO projeto. Devolve `null` quando o ponto não existe ou é de outro projeto
 * — aceitar um id estrangeiro deixaria o chamado apontando para uma escala que
 * a tela do projeto nem consegue exibir.
 */
export async function pontoDoProjeto(projectId: string, pointId: string): Promise<PontoDeEstimativa | null> {
  const ponto = await prisma.estimatePoint.findFirst({
    where: {id: pointId, deletedAt: null, estimate: {projectId, deletedAt: null}},
    select: {id: true, value: true, key: true, estimate: {select: {type: true}}},
  });
  if (!ponto) return null;
  return {id: ponto.id, value: ponto.value, key: ponto.key, tipo: ponto.estimate?.type ?? "points"};
}

/**
 * Campo da atividade, no formato que a tela de histórico entende:
 * `estimate_points` / `estimate_categories` (ver activity-list.tsx no web).
 */
export function campoDeAtividade(tipo?: string | null): string {
  return tipo ? `estimate_${tipo}` : "estimate_point";
}

/** Soma os pontos dos chamados que casam com o filtro Prisma informado. */
export async function somarPontosDosChamados(where: Record<string, unknown>): Promise<number> {
  const chamados = await prisma.issue.findMany({
    where: {...where, estimatePointId: {not: null}},
    select: {estimatePoint: {select: {value: true}}},
  });
  return somarValores(chamados.map((c) => c.estimatePoint?.value));
}
