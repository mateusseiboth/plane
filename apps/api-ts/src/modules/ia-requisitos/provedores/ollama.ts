/**
 * Provedor `ollama` — modelos servidos pelo Ollama.
 *
 * `POST {base}/api/chat`, texto em `.message.content`. `format: "json"` faz o
 * próprio servidor restringir a saída a JSON.
 */

import type {ConfigIaRequisitos} from "@modules/ia-requisitos/config";
import {
  instrucaoDoSistema,
  instrucaoDoUsuario,
  interpretarTextoDoModelo,
  postarJson,
} from "@modules/ia-requisitos/provedores/comum";
import {RESPOSTA_VAZIA, type PedidoIa, type ProvedorDeIa, type RespostaIa} from "@modules/ia-requisitos/tipos";

export function criarProvedorOllama(cfg: ConfigIaRequisitos): ProvedorDeIa {
  return {
    formato: "ollama",
    async sugerir(pedido: PedidoIa): Promise<RespostaIa> {
      const corpo = await postarJson({
        url: `${cfg.urlBase}/api/chat`,
        cabecalhos: cfg.chave ? {Authorization: `Bearer ${cfg.chave}`} : {},
        corpo: {
          model: cfg.modelo || undefined,
          messages: [
            {role: "system", content: instrucaoDoSistema()},
            {role: "user", content: instrucaoDoUsuario(pedido)},
          ],
          format: "json",
          stream: false,
          options: {temperature: 0.2},
        },
        tempoLimiteMs: cfg.tempoLimiteMs,
        destino: cfg.destino,
      });
      if (corpo === null) return RESPOSTA_VAZIA;
      return interpretarTextoDoModelo(corpo?.message?.content);
    },
  };
}
