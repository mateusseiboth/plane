/**
 * Provedor `openai` — qualquer serviço que fale o protocolo de chat da OpenAI
 * (a própria, vLLM, LM Studio, OpenRouter, Groq…).
 *
 * `POST {base}/v1/chat/completions`, credencial em `Authorization: Bearer`,
 * texto em `choices[0].message.content`.
 */

import type {ConfigIaRequisitos} from "@modules/ia-requisitos/config";
import {
  instrucaoDoSistema,
  instrucaoDoUsuario,
  interpretarTextoDoModelo,
  postarJson,
} from "@modules/ia-requisitos/provedores/comum";
import {RESPOSTA_VAZIA, type PedidoIa, type ProvedorDeIa, type RespostaIa} from "@modules/ia-requisitos/tipos";

export function criarProvedorOpenai(cfg: ConfigIaRequisitos): ProvedorDeIa {
  return {
    formato: "openai",
    async sugerir(pedido: PedidoIa): Promise<RespostaIa> {
      const corpo = await postarJson({
        url: `${cfg.urlBase}/v1/chat/completions`,
        cabecalhos: cfg.chave ? {Authorization: `Bearer ${cfg.chave}`} : {},
        corpo: {
          model: cfg.modelo || undefined,
          messages: [
            {role: "system", content: instrucaoDoSistema()},
            {role: "user", content: instrucaoDoUsuario(pedido)},
          ],
          // Sugestão de continuação é curta; temperatura baixa evita invenção.
          temperature: 0.2,
          response_format: {type: "json_object"},
          stream: false,
        },
        tempoLimiteMs: cfg.tempoLimiteMs,
        destino: cfg.destino,
      });
      if (corpo === null) return RESPOSTA_VAZIA;
      return interpretarTextoDoModelo(corpo?.choices?.[0]?.message?.content);
    },
  };
}
