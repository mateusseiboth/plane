import type { VisitFieldError } from "@modules/technical-visit/visit-closing";

/**
 * Erro de negócio da visita com o status HTTP. O `errorHandler` da API devolve
 * `{detail, errors}`, e a tela põe cada `errors[i]` no campo de mesmo nome.
 */
export class VisitError extends Error {
  constructor(
    message: string,
    readonly status = 422,
    readonly errors?: VisitFieldError[]
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class VisitNotFoundError extends VisitError {
  constructor(message = "Visita não encontrada.") {
    super(message, 404);
  }
}

/** Referência inválida (técnico, entidade, sistema, módulo, chamado): volta para o campo. */
export class VisitReferenceError extends VisitError {
  constructor(errors: VisitFieldError[]) {
    super("Revise os campos destacados.", 400, errors);
  }
}

export class VisitClosingError extends VisitError {
  constructor(errors: VisitFieldError[]) {
    super("A visita ainda não pode ser encerrada.", 422, errors);
  }
}
