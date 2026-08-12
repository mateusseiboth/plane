/**
 * Provedor `llamacpp` — o servidor do llama.cpp em modo completion puro.
 *
 * `POST {base}/completion`, texto em `.content`. Não tem papéis de conversa:
 * sistema e usuário viram um prompt só.
 */

import type {ConfigIaRequisitos} from "@modules/ia-requisitos/config";
import {
  instrucaoDoSistema,
  instrucaoDoUsuario,
  interpretarTextoDoModelo,
  postarJson,
} from "@modules/ia-requisitos/provedores/comum";
import {RESPOSTA_VAZIA, type PedidoIa, type ProvedorDeIa, type RespostaIa} from "@modules/ia-requisitos/tipos";

/** Teto de geração: a sugestão é uma continuação curta, não uma redação. */
const MAX_TOKENS = 320;

export function criarProvedorLlamacpp(cfg: ConfigIaRequisitos): ProvedorDeIa {
  return {
    formato: "llamacpp",
    async sugerir(pedido: PedidoIa): Promise<RespostaIa> {
      const corpo = await postarJson({
        url: `${cfg.urlBase}/completion`,
        cabecalhos: cfg.chave ? {Authorization: `Bearer ${cfg.chave}`} : {},
        corpo: {
          prompt: `${instrucaoDoSistema()}\n\n${instrucaoDoUsuario(pedido)}\n\nJSON:`,
          n_predict: MAX_TOKENS,
          temperature: 0.2,
          stream: false,
        },
        tempoLimiteMs: cfg.tempoLimiteMs,
        destino: cfg.destino,
      });
      if (corpo === null) return RESPOSTA_VAZIA;
      return interpretarTextoDoModelo(corpo?.content);
    },
  };
}
