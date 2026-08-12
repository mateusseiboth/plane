/**
 * Provedor `aviao` — o modelo local de requisitos, formato nativo do contrato.
 *
 * `POST {base}/sugerir`, autenticado por `X-API-Key`. É o único que já devolve
 * `sugestao` e `faltando` prontos: a metodologia está no modelo, não no prompt.
 */

import type {ConfigIaRequisitos} from "@modules/ia-requisitos/config";
import {postarJson, sanitizarRespostaNativa} from "@modules/ia-requisitos/provedores/comum";
import {RESPOSTA_VAZIA, type PedidoIa, type ProvedorDeIa, type RespostaIa} from "@modules/ia-requisitos/tipos";

export function criarProvedorAviao(cfg: ConfigIaRequisitos): ProvedorDeIa {
  return {
    formato: "aviao",
    async sugerir(pedido: PedidoIa): Promise<RespostaIa> {
      const corpo = await postarJson({
        url: `${cfg.urlBase}/sugerir`,
        cabecalhos: {"X-API-Key": cfg.chave},
        corpo: pedido,
        tempoLimiteMs: cfg.tempoLimiteMs,
        destino: cfg.destino,
      });
      return corpo === null ? RESPOSTA_VAZIA : sanitizarRespostaNativa(corpo);
    },
  };
}
