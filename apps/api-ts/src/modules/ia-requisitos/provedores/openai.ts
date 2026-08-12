/**
 * Provedor `openai` — qualquer serviço que fale o protocolo de chat da OpenAI
 * (a própria, vLLM, LM Studio, OpenRouter, Groq…).
 *
 * `POST {base}/v1/chat/completions`, credencial em `Authorization: Bearer`,
 * texto em `choices[0].message.content`.
 */

import type {ConfigIaRequisitos} from "@modules/ia-requisitos/config";
import {
  instrucaoDeAnaliseSistema,
  instrucaoDeAnaliseUsuario,
  instrucaoDeMelhoriaSistema,
  instrucaoDeMelhoriaUsuario,
  instrucaoDoSistema,
  instrucaoDoUsuario,
  interpretarAnaliseDoModelo,
  interpretarMelhoriaDoModelo,
  interpretarTextoDoModelo,
  postarJson,
} from "@modules/ia-requisitos/provedores/comum";
import type {
  PedidoAnalise,
  PedidoIa,
  PedidoMelhoria,
  ProvedorDeIa,
  RespostaAnalise,
  RespostaIa,
  RespostaMelhoria,
} from "@modules/ia-requisitos/tipos";

export function criarProvedorOpenai(cfg: ConfigIaRequisitos): ProvedorDeIa {
  /** Devolve o texto gerado, ou `null` quando não houve resposta aproveitável. */
  async function conversar(sistema: string, usuario: string): Promise<unknown> {
    const corpo = await postarJson({
      url: `${cfg.urlBase}/v1/chat/completions`,
      cabecalhos: cfg.chave ? {Authorization: `Bearer ${cfg.chave}`} : {},
      corpo: {
        model: cfg.modelo || undefined,
        messages: [
          {role: "system", content: sistema},
          {role: "user", content: usuario},
        ],
        // Sugestão e análise são trabalho de revisor, não de redator:
        // temperatura baixa evita invenção.
        temperature: 0.2,
        response_format: {type: "json_object"},
        stream: false,
      },
      tempoLimiteMs: cfg.tempoLimiteMs,
      destino: cfg.destino,
    });
    return corpo === null ? null : corpo?.choices?.[0]?.message?.content;
  }

  return {
    formato: "openai",
    async sugerir(pedido: PedidoIa): Promise<RespostaIa> {
      return interpretarTextoDoModelo(await conversar(instrucaoDoSistema(), instrucaoDoUsuario(pedido)));
    },
    async analisar(pedido: PedidoAnalise): Promise<RespostaAnalise> {
      return interpretarAnaliseDoModelo(
        await conversar(instrucaoDeAnaliseSistema(), instrucaoDeAnaliseUsuario(pedido)),
      );
    },
    async melhorar(pedido: PedidoMelhoria): Promise<RespostaMelhoria> {
      const texto = await conversar(instrucaoDeMelhoriaSistema(), instrucaoDeMelhoriaUsuario(pedido));
      return interpretarMelhoriaDoModelo(texto, pedido.texto);
    },
  };
}
