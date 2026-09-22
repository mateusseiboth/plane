/**
 * Número anual do chamado ("12-2026"), como no SAC legado.
 *
 * Quem GERA o número é o banco: o gatilho `issues_assign_ticket_number`
 * (migração 20260922120000_numero_anual_e_nao_lido) preenche `ticket_sequence`
 * e `ticket_year` em todo INSERT de `issues`, por qualquer caminho. Este módulo
 * só lê e escreve a grafia, e expõe o backfill.
 *
 * Regras:
 *  - a contagem é por ESPAÇO DE TRABALHO e reinicia a cada ano (o legado era
 *    global, mas o legado só tinha um espaço);
 *  - o ano é o da abertura no horário de Brasília;
 *  - chamado migrado com número legado N-AAAA fica com esse número, e a
 *    contagem nova continua depois dele.
 */
import prisma from "@db";

/** Menor e maior ano aceitos na busca: fora disso é outro número qualquer. */
const ANO_MINIMO = 1990;
const ANO_MAXIMO = 2099;

type ComNumero = { ticketSequence?: number | null; ticketYear?: number | null };

export type NumeroDoChamado = { sequencial: number; ano: number };

/** "12-2026", ou null enquanto o chamado não tem número. */
export function formatNumeroDoChamado({ ticketSequence, ticketYear }: ComNumero): string | null {
  if (!ticketSequence || !ticketYear) return null;
  return `${ticketSequence}-${ticketYear}`;
}

const isAnoPlausivel = (ano: number) => ano >= ANO_MINIMO && ano <= ANO_MAXIMO;

/** Grafias com separador: "12-2026", "12/2026", "12 2026", "12.2026". */
const COM_SEPARADOR = /^(\d{1,9})\s*[-/._\s]\s*(\d{4})$/;
/** Grafia colada: "122026". Os quatro últimos dígitos são o ano. */
const COLADA = /^(\d{1,9})(\d{4})$/;

/**
 * Lê o número do chamado do jeito que a pessoa digita, ou null quando o termo
 * não tem essa cara. O "#" decorativo é ignorado.
 */
export function parseNumeroDoChamado(termo: string): NumeroDoChamado | null {
  const limpo = termo.trim().replace(/^#/, "");
  const casou = COM_SEPARADOR.exec(limpo) ?? COLADA.exec(limpo);
  if (!casou) return null;

  const numero = { sequencial: Number(casou[1]), ano: Number(casou[2]) };
  if (!numero.sequencial || !isAnoPlausivel(numero.ano)) return null;
  return numero;
}

/**
 * Numera os chamados que ainda estão sem número. Idempotente: a segunda chamada
 * devolve 0. Roda na migração e fica disponível para depois de uma importação
 * feita com o gatilho desligado (scripts/backfill-ticket-number.ts).
 */
export async function backfillNumerosDosChamados(): Promise<number> {
  const [linha] = await prisma.$queryRaw<{ numerados: number }[]>`SELECT backfill_issue_ticket_numbers() AS numerados`;
  return Number(linha?.numerados ?? 0);
}
