/**
 * Provedor `ollama` — modelos servidos pelo Ollama.
 *
 * `POST {base}/api/chat`, texto em `.message.content`. `format: "json"` faz o
 * próprio servidor restringir a saída a JSON.
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

export function criarProvedorOllama(cfg: ConfigIaRequisitos): ProvedorDeIa {
  async function conversar(
    sistema: string,
    usuario: string,
    tempoLimiteMs = cfg.tempoLimiteMs
  ): Promise<unknown> {
    const corpo = await postarJson({
      url: `${cfg.urlBase}/api/chat`,
      cabecalhos: cfg.chave ? {Authorization: `Bearer ${cfg.chave}`} : {},
      corpo: {
        model: cfg.modelo || undefined,
        messages: [
          {role: "system", content: sistema},
          {role: "user", content: usuario},
        ],
        format: "json",
        stream: false,
        options: {temperature: 0.2},
      },
      tempoLimiteMs,
      destino: cfg.destino,
    });
    return corpo === null ? null : corpo?.message?.content;
  }

  return {
    formato: "ollama",
    async sugerir(pedido: PedidoIa): Promise<RespostaIa> {
      return interpretarTextoDoModelo(await conversar(instrucaoDoSistema(), instrucaoDoUsuario(pedido)));
    },
    async analisar(pedido: PedidoAnalise): Promise<RespostaAnalise> {
      return interpretarAnaliseDoModelo(
        await conversar(instrucaoDeAnaliseSistema(), instrucaoDeAnaliseUsuario(pedido)),
      );
    },
    // Como nos demais formatos genéricos, a proposta vem sem `avisos` e sem nota
    // de aceitação — quem os calcula é o serviço nativo.
    async melhorar(pedido: PedidoMelhoria): Promise<RespostaMelhoria> {
      const texto = await conversar(
        instrucaoDeMelhoriaSistema(),
        instrucaoDeMelhoriaUsuario(pedido),
        cfg.tempoLimiteMelhoriaMs
      );
      return interpretarMelhoriaDoModelo(texto, pedido.texto);
    },
  };
}
