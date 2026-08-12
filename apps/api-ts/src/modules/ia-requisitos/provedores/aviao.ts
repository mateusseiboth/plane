/**
 * Provedor `aviao` — o modelo local de requisitos, formato nativo do contrato.
 *
 * `POST {base}/sugerir` e `POST {base}/analisar`, autenticados por `X-API-Key`.
 * É o único que já devolve tudo pronto: a metodologia está no modelo e a nota de
 * aceitação sai do checklist determinístico do serviço, não do prompt.
 */

import type {ConfigIaRequisitos} from "@modules/ia-requisitos/config";
import {postarJson, sanitizarAnaliseNativa, sanitizarRespostaNativa} from "@modules/ia-requisitos/provedores/comum";
import {
  ANALISE_VAZIA,
  RESPOSTA_VAZIA,
  type PedidoAnalise,
  type PedidoIa,
  type ProvedorDeIa,
  type RespostaAnalise,
  type RespostaIa,
} from "@modules/ia-requisitos/tipos";

export function criarProvedorAviao(cfg: ConfigIaRequisitos): ProvedorDeIa {
  /** O formato nativo manda o pedido como está: os dois lados falam o contrato. */
  const chamar = (caminho: string, corpo: unknown) =>
    postarJson({
      url: `${cfg.urlBase}${caminho}`,
      cabecalhos: {"X-API-Key": cfg.chave},
      corpo,
      tempoLimiteMs: cfg.tempoLimiteMs,
      destino: cfg.destino,
    });

  return {
    formato: "aviao",
    async sugerir(pedido: PedidoIa): Promise<RespostaIa> {
      const corpo = await chamar("/sugerir", pedido);
      return corpo === null ? RESPOSTA_VAZIA : sanitizarRespostaNativa(corpo);
    },
    async analisar(pedido: PedidoAnalise): Promise<RespostaAnalise> {
      const corpo = await chamar("/analisar", pedido);
      return corpo === null ? ANALISE_VAZIA : sanitizarAnaliseNativa(corpo);
    },
  };
}
