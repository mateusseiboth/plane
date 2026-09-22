/**
 * Fim do dia (`zapi/cron.php` do SAC): as conversas de WhatsApp que ficaram
 * abertas são encerradas com um aviso ao cliente.
 *
 * O horário de corte é o configurado; sem ele, o fim do expediente do dia. Tudo
 * no fuso da empresa: o container roda em UTC (ver src/presence.ts).
 */

type Janela = { weekday: number | string; start_time: string; end_time: string };

const DIAS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

type Partes = { ano: number; mes: number; dia: number; weekday: number; hora: number; minuto: number };

function readPartes(instante: Date, fuso: string): Partes {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instante);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "0";
  return {
    ano: Number(valor("year")),
    mes: Number(valor("month")),
    dia: Number(valor("day")),
    weekday: DIAS[valor("weekday")] ?? 0,
    // "24" aparece à meia-noite em algumas plataformas com hour12:false.
    hora: Number(valor("hour")) % 24,
    minuto: Number(valor("minute")),
  };
}

const toMinutos = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Diferença entre o relógio do fuso e o UTC, naquele instante. */
function getDeslocamentoMs(instante: Date, fuso: string): number {
  const p = readPartes(instante, fuso);
  const comoUtc = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto);
  return comoUtc - Math.floor(instante.getTime() / 60_000) * 60_000;
}

const HORARIO_VALIDO = /^\d{1,2}:\d{2}$/;

function findFimDoExpediente(expediente: Janela[], weekday: number): string | null {
  const doDia = expediente.filter((j) => Number(j.weekday) === weekday).map((j) => j.end_time);
  if (!doDia.length) return null;
  return doDia.reduce((maior, atual) => (toMinutos(atual) > toMinutos(maior) ? atual : maior));
}

export type EntradaDoCorte = { agora: Date; fuso: string; horario: string | null; expediente: Janela[] };

/**
 * O instante do corte de hoje, se ele já passou. Nulo quando ainda não é hora
 * ou quando o dia não tem expediente nem horário configurado.
 */
export function buildCorteDoDia({ agora, fuso, horario, expediente }: EntradaDoCorte): Date | null {
  const local = readPartes(agora, fuso);
  const hhmm = horario && HORARIO_VALIDO.test(horario) ? horario : findFimDoExpediente(expediente, local.weekday);
  if (!hhmm) return null;
  const minutos = toMinutos(hhmm);
  const comoUtc = Date.UTC(local.ano, local.mes - 1, local.dia, Math.floor(minutos / 60), minutos % 60);
  const corte = new Date(comoUtc - getDeslocamentoMs(agora, fuso));
  return agora.getTime() >= corte.getTime() ? corte : null;
}
