/**
 * Erros tipados do disparo em massa. A rota traduz por `instanceof` (status,
 * mensagem e campos recusados), nunca pelo texto.
 */

import type { CampoComErro, Resultado } from "@/ligacoes/payload";

export class DisparoError extends Error {
  constructor(
    message: string,
    readonly status = 422,
    readonly errors: CampoComErro[] = []
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotAutenticadoError extends DisparoError {
  constructor() {
    super("Não autenticado.", 401);
  }
}

export class WithoutPermissaoError extends DisparoError {
  constructor() {
    super("Sua função não permite esta ação.", 403);
  }
}

export class CamposInvalidosError extends DisparoError {
  constructor(errors: CampoComErro[]) {
    super("Confira os campos destacados.", 400, errors);
  }
}

/** O dado lido, ou 400 com os campos recusados. */
export const requireValid = <T>(r: Resultado<T>): T => {
  if (r.ok) return r.data;
  throw new CamposInvalidosError(r.errors);
};

export class MensagemNaoEncontradaError extends DisparoError {
  constructor() {
    super("Mensagem não encontrada.", 404);
  }
}

export class ExecucaoNaoEncontradaError extends DisparoError {
  constructor() {
    super("Envio não encontrado.", 404);
  }
}

export class WithoutDestinatariosError extends DisparoError {
  constructor() {
    super("Nenhum destinatário para os filtros escolhidos.", 422);
  }
}

export class EnvioEmAndamentoError extends DisparoError {
  constructor() {
    super("Esta mensagem já está sendo enviada. Aguarde terminar ou cancele o envio.", 409);
  }
}

export class StatusWithoutImagemError extends DisparoError {
  constructor() {
    super("Só é possível publicar no Status uma mensagem com imagem.", 422);
  }
}

export class ProvedorIndisponivelError extends DisparoError {
  constructor() {
    super("WhatsApp não configurado ou desativado.", 422);
  }
}

export class ArquivoIndisponivelError extends DisparoError {
  constructor() {
    super("O arquivo da mensagem não foi encontrado. Anexe de novo.", 422);
  }
}
