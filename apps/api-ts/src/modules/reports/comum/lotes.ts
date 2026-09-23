/**
 * Consulta em lotes para listas grandes de ids.
 *
 * Um `where: { id: { in: ids } }` com dezenas de milhares de ids estoura o
 * limite de parâmetros do Postgres (o Prisma devolve P2029). Com "situação =
 * todos" os relatórios passam de 50 mil chamados, então toda consulta por lista
 * de ids entra por aqui.
 */

export const TAMANHO_DO_LOTE = 5_000;

export async function findEmLotes<I, T>(
  ids: readonly I[],
  tamanho: number,
  consulta: (lote: I[]) => Promise<T[]>
): Promise<T[]> {
  const resultado: T[] = [];
  for (let inicio = 0; inicio < ids.length; inicio += tamanho) {
    resultado.push(...(await consulta(ids.slice(inicio, inicio + tamanho))));
  }
  return resultado;
}
