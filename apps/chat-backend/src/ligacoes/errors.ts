/**
 * Erros tipados das ligações. A rota traduz por `instanceof` (status + mensagem
 * + campos recusados), nunca pelo texto.
 */

import type { CampoComErro, Resultado } from "@/ligacoes/payload";

export class LigacaoError extends Error {
  constructor(
    message: string,
    readonly status = 422,
    readonly errors: CampoComErro[] = []
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NaoAutenticadoError extends LigacaoError {
  constructor() {
    super("Não autenticado.", 401);
  }
}

export class TokenDeServicoInvalidoError extends LigacaoError {
  constructor() {
    super("Token de serviço inválido.", 401);
  }
}

export class SemPermissaoError extends LigacaoError {
  constructor() {
    super("Sua função não permite esta ação.", 403);
  }
}

export class CamposInvalidosError extends LigacaoError {
  constructor(errors: CampoComErro[]) {
    super("Confira os campos destacados.", 400, errors);
  }
}

/** O dado lido, ou 400 com os campos recusados. */
export const requireValid = <T>(r: Resultado<T>): T => {
  if (r.ok) return r.data;
  throw new CamposInvalidosError(r.errors);
};

export class LigacaoNaoEncontradaError extends LigacaoError {
  constructor() {
    super("Ligação não encontrada.", 404);
  }
}

export class AtendimentoNaoEncontradoError extends LigacaoError {
  constructor() {
    super("Atendimento não encontrado.", 404);
  }
}

export class ChamadoNaoEncontradoError extends LigacaoError {
  constructor() {
    super("Chamado não encontrado neste espaço.", 404);
  }
}

export class LigacaoDeOutraPessoaError extends LigacaoError {
  constructor() {
    super("Esta ligação já está com outra pessoa.", 409);
  }
}

export class LigacaoEncerradaError extends LigacaoError {
  constructor() {
    super("Esta ligação já foi encerrada.", 409);
  }
}

export class LigacaoJaConcluidaError extends LigacaoError {
  constructor() {
    super("Esta ligação já foi concluída.", 409);
  }
}
