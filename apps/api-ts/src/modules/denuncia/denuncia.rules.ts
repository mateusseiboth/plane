/**
 * Regras puras da denúncia interna: validação e o dia do registro.
 *
 * A denúncia guarda só o DIA, no fuso da empresa. Hora e minuto permitiriam
 * cruzar com o log de acesso, com o horário de quem estava na sala ou com a
 * própria trilha de auditoria, e descobrir o autor da anônima.
 */
import type { FieldErrorItem } from "@utils/field-error";

export const TITULO_MAXIMO = 200;
const DESCRICAO_MAXIMA = 10_000;

export type DenunciaData = { title: string; description: string; isAnonymous: boolean };

const text = (valor: unknown) => (typeof valor === "string" ? valor.trim() : "");

/** `YYYY-MM-DD` do instante no fuso informado. */
export function formatDiaLocal(instante: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    instante
  );
}

type Check = [path: string, messageOf: (body: Record<string, unknown>) => string | null];

const CHECKS: Check[] = [
  [
    "title",
    (b) => {
      if (!text(b.title)) return "Informe o título.";
      if (text(b.title).length > TITULO_MAXIMO) return `O título pode ter até ${TITULO_MAXIMO} caracteres.`;
      return null;
    },
  ],
  ["description", (b) => (text(b.description) ? null : "Descreva o que aconteceu.")],
];

export function validateDenunciaInput(body: Record<string, unknown>): { data: DenunciaData; errors: FieldErrorItem[] } {
  const errors = CHECKS.map(([path, messageOf]) => ({ path, message: messageOf(body) })).filter(
    (e): e is FieldErrorItem => e.message !== null
  );
  return {
    errors,
    data: {
      title: text(body.title),
      description: text(body.description).slice(0, DESCRICAO_MAXIMA),
      isAnonymous: body.is_anonymous === true,
    },
  };
}
