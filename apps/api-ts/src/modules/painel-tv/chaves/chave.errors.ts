/** Erros tipados dos painéis de TV: a rota decide o status por `instanceof`. */

export class PainelError extends Error {
  constructor(
    message: string,
    readonly status = 422
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Chave ausente, desconhecida, revogada ou de outro espaço: tudo dá no mesmo. */
export class ChaveDePainelInvalidaError extends PainelError {
  constructor() {
    super("Chave do painel inválida ou revogada.", 401);
  }
}

export class PainelNaoLiberadoError extends PainelError {
  constructor() {
    super("Esta chave não abre este painel.", 403);
  }
}

export class MuitasRequisicoesDoPainelError extends PainelError {
  constructor() {
    super("Muitas consultas seguidas. Aguarde um instante.", 429);
  }
}

export class ChaveDePainelNaoEncontradaError extends PainelError {
  constructor() {
    super("Chave não encontrada.", 404);
  }
}

export class PainelDesconhecidoError extends PainelError {
  constructor() {
    super("Painel desconhecido.", 404);
  }
}

export type ErroDeCampo = { path: string; message: string };

/** Corpo recusado: cada item volta para o campo do formulário. */
export class ValidacaoDaChaveError extends PainelError {
  constructor(readonly errors: ErroDeCampo[]) {
    super("Revise os campos da chave.", 400);
  }
}

/** Configuração das colunas recusada, campo a campo. */
export class ValidacaoDasColunasError extends PainelError {
  constructor(readonly errors: ErroDeCampo[]) {
    super("Revise as colunas do painel.", 400);
  }
}
