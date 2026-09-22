/** Recusas do painel de backups. O tratador global decide o status por `status`. */

import { PainelError, type ErroDeCampo } from "@modules/painel-tv/chaves/chave.errors";

/** Parâmetro recusado: cada item volta para o CAMPO do filtro na tela. */
export class ValidacaoDoHistoricoError extends PainelError {
  constructor(readonly errors: ErroDeCampo[]) {
    super("Revise os filtros do histórico.", 400);
  }
}

export class EntidadeDoBackupNaoEncontradaError extends PainelError {
  constructor() {
    super("Entidade não encontrada neste espaço.", 404);
  }
}
