/**
 * Erros tipados das ferramentas do atendente. A rota traduz por `instanceof`
 * (status, mensagem e campos recusados), nunca pelo texto.
 */

import type { CampoComErro, Resultado } from "@/ligacoes/payload";

export class AtendenteError extends Error {
  constructor(
    message: string,
    readonly status = 422,
    readonly errors: CampoComErro[] = [],
    readonly extra: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NaoAutenticadoError extends AtendenteError {
  constructor() {
    super("Não autenticado.", 401);
  }
}

export class SemPermissaoError extends AtendenteError {
  constructor() {
    super("Você não tem permissão para esta ação no chat.", 403);
  }
}

export class CamposInvalidosError extends AtendenteError {
  constructor(errors: CampoComErro[]) {
    super("Confira os campos destacados.", 400, errors);
  }
}

/** O dado lido, ou 400 com os campos recusados. */
export const requireValid = <T>(r: Resultado<T>): T => {
  if (r.ok) return r.data;
  throw new CamposInvalidosError(r.errors);
};

export class AtendimentoNaoEncontradoError extends AtendenteError {
  constructor() {
    super("Atendimento não encontrado.", 404);
  }
}

export class FraseNaoEncontradaError extends AtendenteError {
  constructor() {
    super("Frase não encontrada.", 404);
  }
}

export class ConversaJaAbertaError extends AtendenteError {
  constructor(sessionId: string) {
    super("Já existe uma conversa aberta com este número.", 409, [], { session_id: sessionId });
  }
}
