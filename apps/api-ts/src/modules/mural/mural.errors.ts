/** Erros tipados do mural: a rota decide o status por `instanceof`, nunca pelo texto. */
import type { MuralFieldError } from "@modules/mural/mural.rules";

export class MuralError extends Error {
  constructor(
    message: string,
    readonly status = 422,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class MuralNotFoundError extends MuralError {
  constructor() {
    super("Recado não encontrado.", 404);
  }
}

/** Corpo recusado: cada item volta para o campo do formulário. */
export class MuralValidationError extends MuralError {
  constructor(readonly errors: MuralFieldError[]) {
    super("Revise os campos do recado.", 400);
  }
}
