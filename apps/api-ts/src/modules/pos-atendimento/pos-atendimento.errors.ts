/**
 * Erros tipados do pós-atendimento, com o status HTTP. O `errorHandler` da API
 * devolve `{detail, errors}` e a tela põe cada `errors[i]` no campo de mesmo nome.
 */
import type { PosFieldError } from "@modules/pos-atendimento/pos-atendimento.rules";

export class PosAtendimentoError extends Error {
  constructor(
    message: string,
    readonly status = 422,
    readonly errors?: PosFieldError[]
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class PosNotFoundError extends PosAtendimentoError {
  constructor(message = "Pós-atendimento não encontrado.") {
    super(message, 404);
  }
}

export class PosConflictError extends PosAtendimentoError {
  constructor(message: string) {
    super(message, 409);
  }
}

export class PosNotConcludedError extends PosAtendimentoError {
  constructor(message: string) {
    super(message, 422);
  }
}

/** Formulário recusado: cada item volta para o campo. */
export class PosValidationError extends PosAtendimentoError {
  constructor(errors: PosFieldError[]) {
    super("Revise os campos do pós-atendimento.", 400, errors);
  }
}
