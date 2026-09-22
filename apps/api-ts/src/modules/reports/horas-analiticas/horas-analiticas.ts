/**
 * Horas analíticas por analista (`listar_relatorio_semanal_horas.php` do SAC):
 * os lançamentos de tempo de cada pessoa, do que mais lançou ao que menos, cada
 * grupo em ordem de data. Puro.
 */
export type LancamentoDeHoras = { id: string; usuarioId: string; minutos: number; data: Date };

export function groupLancamentosPorAnalista<T extends LancamentoDeHoras>(lancamentos: T[]) {
  const porAnalista = new Map<string, T[]>();
  for (const lancamento of lancamentos) {
    porAnalista.set(lancamento.usuarioId, [...(porAnalista.get(lancamento.usuarioId) ?? []), lancamento]);
  }
  return [...porAnalista.entries()]
    .map(([usuarioId, lista]) => ({
      usuarioId,
      minutos: lista.reduce((soma, l) => soma + l.minutos, 0),
      lancamentos: lista.toSorted((a, b) => a.data.getTime() - b.data.getTime()),
    }))
    .toSorted((a, b) => b.minutos - a.minutos);
}
