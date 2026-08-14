/**
 * Vencimento (`target_date`) com hora.
 *
 * A coluna sempre foi `DateTime` e o SLA (@utils/sla) sempre calculou um
 * instante preciso — `base + horas da etiqueta + ajuste da prioridade`. Quem
 * jogava a hora fora era a serialização (`dateOnly`) e a entrada, que lia
 * "2026-09-30" como meia-noite UTC. Demandas com prazo de poucas horas ficavam
 * impossíveis de representar.
 *
 * Regras do formato:
 *
 * 1. Na SAÍDA, `target_date` é ISO completo — `2026-09-30T21:00:00.000Z`.
 * 2. Na ENTRADA valem três formas, para não quebrar integrações nem links
 *    antigos:
 *      - ISO com fuso   — `2026-09-30T14:00:00-04:00`, `...Z`  → instante literal
 *      - ISO sem fuso   — `2026-09-30T14:00`                   → 14:00 no fuso do escritório
 *      - data pura      — `2026-09-30`                         → FIM do dia 30
 * 3. Data pura vira o FIM do dia, não o começo. Um prazo "30/09" que vencesse
 *    00:00 do dia 30 nasceria vencido: quem escreveu "30/09" está contando com
 *    o dia 30 inteiro. É também o que se combina em português — "me entrega até
 *    dia 30" inclui o dia 30.
 * 4. "Dia" é contado no FUSO DO ESCRITÓRIO, não no do processo. O container da
 *    API roda em UTC e os usuários estão em Mato Grosso do Sul (UTC-4); pelo
 *    relógio do processo, "fim do dia 30" apareceria na tela como 19:59 do dia
 *    30 e o prazo estouraria quatro horas antes do combinado.
 *
 * `start_date` continua saindo como data pura (é uma data de início, não um
 * instante), mas entra por aqui com a borda oposta — começo do dia — para que
 * o instante gravado caia no mesmo dia em que ele é exibido.
 */

/**
 * Fuso em que o dia é contado. Espelha o `timezone` do espaço de trabalho
 * (`America/Campo_Grande` em produção); o env existe para quem hospedar a
 * instância em outro estado.
 */
const FUSO = process.env.APP_TIMEZONE ?? "America/Campo_Grande";

/** `2026-09-30` — data pura, sem hora nenhuma. */
const SO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `2026-09-30T14:00`, `2026-09-30 14:00:00.500` — tem hora, não tem fuso. */
const SEM_FUSO = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?$/;

const RELOGIO = new Intl.DateTimeFormat("en-US", {
  timeZone: FUSO,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

type Parede = {ano: number; mes: number; dia: number; hora: number; minuto: number; segundo: number};

/** O que o relógio de parede do escritório marca num dado instante. */
function parede(instante: Date): Parede {
  const partes: Record<string, string> = {};
  for (const p of RELOGIO.formatToParts(instante)) if (p.type !== "literal") partes[p.type] = p.value;
  return {
    ano: Number(partes.year),
    mes: Number(partes.month),
    dia: Number(partes.day),
    // Meia-noite sai como "24" em parte das implementações de `hour12: false`.
    hora: Number(partes.hour) % 24,
    minuto: Number(partes.minute),
    segundo: Number(partes.second),
  };
}

/** Quanto o fuso está à frente do UTC naquele instante, em milissegundos. */
function deslocamento(instante: Date): number {
  const p = parede(instante);
  const comoSeFosseUtc = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  // O formatador não devolve milissegundos, então compara segundo a segundo.
  return comoSeFosseUtc - Math.floor(instante.getTime() / 1000) * 1000;
}

/**
 * O instante em que o relógio do escritório marca a hora pedida.
 *
 * Duas passadas: a primeira estima o deslocamento pelo palpite em UTC, a
 * segunda o confirma já perto do instante certo — o que importa se algum dia
 * o fuso voltar a ter horário de verão.
 */
function instanteLocal(ano: number, mes: number, dia: number, hora: number, minuto: number, segundo: number, ms: number): Date {
  const comoUtc = Date.UTC(ano, mes - 1, dia, hora, minuto, segundo, ms);
  const palpite = comoUtc - deslocamento(new Date(comoUtc));
  return new Date(comoUtc - deslocamento(new Date(palpite)));
}

/** Primeiro milissegundo do dia, no fuso do escritório. */
export function inicioDoDia(ano: number, mes: number, dia: number): Date {
  return instanteLocal(ano, mes, dia, 0, 0, 0, 0);
}

/** Último milissegundo do dia, no fuso do escritório. */
export function fimDoDia(ano: number, mes: number, dia: number): Date {
  return instanteLocal(ano, mes, dia, 23, 59, 59, 999);
}

/** Meia-noite de hoje — ou de `dias` dias à frente/atrás — no fuso do escritório. */
export function inicioDeHoje(dias = 0, agora: Date = new Date()): Date {
  const p = parede(agora);
  return inicioDoDia(p.ano, p.mes, p.dia + dias);
}

/** `YYYY-MM-DD` do dia em que o instante cai para quem está no escritório. */
export function dataLocal(instante: Date): string {
  const p = parede(instante);
  return `${p.ano}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`;
}

/** Qual borda do dia uma data pura ocupa. */
export type BordaDoDia = "inicio" | "fim";

const BORDAS: Record<BordaDoDia, (ano: number, mes: number, dia: number) => Date> = {
  inicio: inicioDoDia,
  fim: fimDoDia,
};

/**
 * Interpreta o valor recebido como instante, conforme as três formas aceitas.
 * `borda` só decide o que fazer com data pura. Lixo vira `null` em vez de
 * `Invalid Date`, para não derrubar a rota nem gravar uma data quebrada.
 */
export function instanteDaEntrada(valor: unknown, borda: BordaDoDia): Date | null {
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  if (!texto) return null;

  const pura = SO_DATA.exec(texto);
  if (pura) return BORDAS[borda](Number(pura[1]), Number(pura[2]), Number(pura[3]));

  const local = SEM_FUSO.exec(texto);
  if (local) {
    return instanteLocal(
      Number(local[1]),
      Number(local[2]),
      Number(local[3]),
      Number(local[4]),
      Number(local[5]),
      Number(local[6] ?? 0),
      Number((local[7] ?? "0").padEnd(3, "0")),
    );
  }

  const instante = new Date(texto);
  return Number.isNaN(instante.getTime()) ? null : instante;
}

/** Vencimento vindo do corpo da requisição. Data pura = fim do dia. */
export function vencimentoRecebido(valor: unknown): Date | null {
  return instanteDaEntrada(valor, "fim");
}

/** Início vindo do corpo da requisição. Data pura = começo do dia. */
export function inicioRecebido(valor: unknown): Date | null {
  return instanteDaEntrada(valor, "inicio");
}
