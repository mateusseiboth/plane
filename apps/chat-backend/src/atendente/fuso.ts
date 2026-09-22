/**
 * Dia no fuso da empresa. O container roda em UTC; o expediente, os feriados e
 * os filtros de período são cadastrados em hora local. Puro.
 */

/** O dia (AAAA-MM-DD) de um instante no fuso informado. */
export const readDataLocal = (instante: Date, fuso: string): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    instante
  );

/** Instante em que o dia local `data` (AAAA-MM-DD) começa no fuso informado. */
export function readInicioDoDia(data: string, fuso: string): Date {
  const meiaNoiteUtc = new Date(`${data}T00:00:00Z`);
  // Diferença entre o relógio UTC e o do fuso nesse instante (mesma leitura dos dois lados).
  const deslocamento =
    new Date(meiaNoiteUtc.toLocaleString("en-US", { timeZone: "UTC" })).getTime() -
    new Date(meiaNoiteUtc.toLocaleString("en-US", { timeZone: fuso })).getTime();
  return new Date(meiaNoiteUtc.getTime() + deslocamento);
}
