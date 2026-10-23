/**
 * Provedor `llamacpp` — o servidor do llama.cpp em modo completion puro.
 *
 * `POST {base}/completion`, texto em `.content`. Não tem papéis de conversa:
 * sistema e usuário viram um prompt só.
 */

import type {ConfigIaRequisitos} from "@modules/ia-requisitos/config";
import {
  buildInstrucaoDeResolucaoSistema,
  buildInstrucaoDeResolucaoUsuario,
  instrucaoDeAnaliseSistema,
  instrucaoDeAnaliseUsuario,
  instrucaoDeMelhoriaSistema,
  instrucaoDeMelhoriaUsuario,
  instrucaoDoSistema,
  instrucaoDoUsuario,
  interpretarAnaliseDoModelo,
  interpretarMelhoriaDoModelo,
  interpretarTextoDoModelo,
  parseResolucaoDoModelo,
  postarJson,
} from "@modules/ia-requisitos/provedores/comum";
import type {
  PedidoAnalise,
  PedidoIa,
  PedidoMelhoria,
  PedidoResolucao,
  ProvedorDeIa,
  RespostaAnalise,
  RespostaIa,
  RespostaMelhoria,
} from "@modules/ia-requisitos/tipos";

/** Teto de geração da sugestão: é uma continuação curta, não uma redação. */
const MAX_TOKENS_SUGESTAO = 320;
/** A análise devolve oito blocos, os porquês e os trechos prontos — cabe mais. */
const MAX_TOKENS_ANALISE = 900;
/** A melhoria devolve o texto inteiro reescrito: precisa caber o chamado todo. */
const MAX_TOKENS_MELHORIA = 2048;
/** A sugestão de solução cabe num aviso de até ~600 caracteres. */
const MAX_TOKENS_RESOLUCAO = 320;

export function criarProvedorLlamacpp(cfg: ConfigIaRequisitos): ProvedorDeIa {
  async function completar(
    sistema: string,
    usuario: string,
    maxTokens: number,
    tempoLimiteMs = cfg.tempoLimiteMs
  ): Promise<unknown> {
    const corpo = await postarJson({
      url: `${cfg.urlBase}/completion`,
      cabecalhos: cfg.chave ? {Authorization: `Bearer ${cfg.chave}`} : {},
      corpo: {
        prompt: `${sistema}\n\n${usuario}\n\nJSON:`,
        n_predict: maxTokens,
        temperature: 0.2,
        stream: false,
      },
      tempoLimiteMs,
      destino: cfg.destino,
    });
    return corpo === null ? null : corpo?.content;
  }

  return {
    formato: "llamacpp",
    async sugerir(pedido: PedidoIa): Promise<RespostaIa> {
      const texto = await completar(instrucaoDoSistema(), instrucaoDoUsuario(pedido), MAX_TOKENS_SUGESTAO);
      return interpretarTextoDoModelo(texto);
    },
    async analisar(pedido: PedidoAnalise): Promise<RespostaAnalise> {
      const texto = await completar(
        instrucaoDeAnaliseSistema(),
        instrucaoDeAnaliseUsuario(pedido),
        MAX_TOKENS_ANALISE,
      );
      return interpretarAnaliseDoModelo(texto);
    },
    // Como nos demais formatos genéricos, a proposta vem sem `avisos` e sem nota
    // de aceitação — quem os calcula é o serviço nativo.
    async melhorar(pedido: PedidoMelhoria): Promise<RespostaMelhoria> {
      const texto = await completar(
        instrucaoDeMelhoriaSistema(),
        instrucaoDeMelhoriaUsuario(pedido),
        MAX_TOKENS_MELHORIA,
        cfg.tempoLimiteMelhoriaMs,
      );
      return interpretarMelhoriaDoModelo(texto, pedido.texto);
    },
    async resolve(pedido: PedidoResolucao): Promise<string> {
      const texto = await completar(
        buildInstrucaoDeResolucaoSistema(),
        buildInstrucaoDeResolucaoUsuario(pedido),
        MAX_TOKENS_RESOLUCAO,
        cfg.tempoLimiteMelhoriaMs,
      );
      return parseResolucaoDoModelo(texto);
    },
  };
}
