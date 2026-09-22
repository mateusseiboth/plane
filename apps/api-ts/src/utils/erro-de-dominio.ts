/**
 * Erros tipados dos módulos de ouvidoria, denúncia, currículos e lista de
 * e-mails. Carregam o status HTTP e, na validação, os campos recusados: o
 * tratador global (`buildErrorBody`) devolve `{ detail, errors: [{path, message}] }`
 * e a tela marca cada campo.
 */
import type { FieldErrorItem } from "@utils/field-error";

export class DomainError extends Error {
  constructor(
    message: string,
    readonly status = 422
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  constructor(message = "Registro não encontrado.") {
    super(message, 404);
  }
}

export class FieldValidationError extends DomainError {
  constructor(
    readonly errors: FieldErrorItem[],
    message = "Revise os campos informados."
  ) {
    super(message, 400);
  }
}

/** Levanta a validação quando houver campo recusado. */
export function requireNoFieldErrors(errors: FieldErrorItem[], message?: string): void {
  if (!errors.length) return;
  throw new FieldValidationError(errors, message);
}
