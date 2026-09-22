/**
 * Calendário de feriados do atendimento (aba Horários). Em feriado a empresa
 * está fora do horário o dia inteiro, com expediente cadastrado ou não.
 * Feriado recorrente vale todo ano no mesmo dia e mês (Natal, Tiradentes).
 *
 * Fica em `chat_bot_config.holidays` como `[{ date, label, recorrente }]`.
 * Puro: validação e a pergunta "hoje é feriado?".
 */

import { asCorpo, erro, readText, type CampoComErro, type Resultado } from "@/ligacoes/payload";

export type Feriado = { date: string; label: string; recorrente: boolean };

const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
const LIMITE_DA_DESCRICAO = 120;

/** AAAA-MM-DD de um dia que existe (30 de fevereiro não passa). */
function isDataValida(valor: unknown): valor is string {
  if (typeof valor !== "string" || !DATA.test(valor)) return false;
  const data = new Date(`${valor}T12:00:00Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}

function readLinha(bruto: unknown, i: number, vistas: Set<string>): { feriado: Feriado; errors: CampoComErro[] } {
  const linha = asCorpo(bruto);
  const label = readText(linha.label, LIMITE_DA_DESCRICAO) ?? "";
  const errors: CampoComErro[] = [];
  const dataValida = isDataValida(linha.date);
  if (!dataValida) errors.push(erro(`feriados[${i}].date`, "Informe uma data válida."));
  if (dataValida && vistas.has(linha.date as string))
    errors.push(erro(`feriados[${i}].date`, "Esta data já está na lista."));
  if (!label) errors.push(erro(`feriados[${i}].label`, "Informe a descrição do feriado."));
  if (dataValida) vistas.add(linha.date as string);
  return { feriado: { date: String(linha.date ?? ""), label, recorrente: linha.recorrente === true }, errors };
}

/** A lista é SUBSTITUÍDA inteira a cada gravação. */
export function parseFeriados(body: unknown): Resultado<Feriado[]> {
  const brutos = asCorpo(body).feriados;
  const vistas = new Set<string>();
  const linhas = (Array.isArray(brutos) ? brutos : []).map((bruto, i) => readLinha(bruto, i, vistas));
  const errors = linhas.flatMap((l) => l.errors);
  if (errors.length) return { ok: false, errors };
  return { ok: true, data: linhas.map((l) => l.feriado).toSorted((a, b) => a.date.localeCompare(b.date)) };
}

/** Lista gravada no banco (JSON), tolerante: linha estragada é ignorada. */
export function readFeriadosGravados(raw: unknown): Feriado[] {
  return (Array.isArray(raw) ? raw : [])
    .map((bruto) => asCorpo(bruto))
    .filter((linha) => isDataValida(linha.date))
    .map((linha) => ({
      date: String(linha.date),
      label: String(linha.label ?? ""),
      recorrente: linha.recorrente === true,
    }));
}

const isMesmoDia = (feriado: Feriado, dataLocal: string): boolean =>
  feriado.recorrente ? feriado.date.slice(5) === dataLocal.slice(5) : feriado.date === dataLocal;

/** `dataLocal` é o dia no fuso da empresa (`readDataLocal` de `@/atendente/fuso`). */
export const isFeriado = (feriados: Feriado[], dataLocal: string): boolean =>
  feriados.some((f) => isMesmoDia(f, dataLocal));
