/**
 * Período dos relatórios em horário de Brasília. O banco grava em UTC, mas a
 * semana, o mês e o ano do relatório são os do operador: um chamado das 22h de
 * 31/12 ainda é do ano que termina (mesma regra do número anual).
 *
 * Brasília é UTC-3 fixo desde 2019 (sem horário de verão).
 */
export const FUSO_BRASILIA_MS = 3 * 3_600_000;
const DIA_MS = 86_400_000;

export type Periodo = { inicio: Date; fim: Date };

/** O instante visto como relógio de Brasília (os campos UTC passam a ser os locais). */
export const toBrasilia = (d: Date) => new Date(d.getTime() - FUSO_BRASILIA_MS);

/** Relógio de Brasília de volta para o instante UTC. */
export const fromBrasilia = (d: Date) => new Date(d.getTime() + FUSO_BRASILIA_MS);

/** Segunda 00:00 a domingo 23:59:59.999, em Brasília. */
export function resolveSemanaAtual(agora: Date): Periodo {
  const local = toBrasilia(agora);
  const diasDesdeSegunda = (local.getUTCDay() + 6) % 7;
  const segunda = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - diasDesdeSegunda);
  return { inicio: fromBrasilia(new Date(segunda)), fim: fromBrasilia(new Date(segunda + 7 * DIA_MS - 1)) };
}

/** 1º de janeiro do ano corrente até agora, em Brasília. */
export function resolveAnoAtual(agora: Date): Periodo {
  const local = toBrasilia(agora);
  return { inicio: fromBrasilia(new Date(Date.UTC(local.getUTCFullYear(), 0, 1))), fim: agora };
}

/** Os últimos 12 meses (o corrente e os 11 anteriores), em Brasília. */
export function resolveUltimos12Meses(agora: Date): Periodo {
  const local = toBrasilia(agora);
  return { inicio: fromBrasilia(new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 11, 1))), fim: agora };
}

/** O período pedido; o lado que faltar vem do padrão do relatório. */
export function resolvePeriodo(pedido: { dateFrom?: Date; dateTo?: Date }, padrao: () => Periodo): Periodo {
  const base = padrao();
  return { inicio: pedido.dateFrom ?? base.inicio, fim: pedido.dateTo ?? base.fim };
}

export const isNoPeriodo = (d: Date | null | undefined, p: Periodo): d is Date => !!d && d >= p.inicio && d <= p.fim;
