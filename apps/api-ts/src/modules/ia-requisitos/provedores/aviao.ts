/**
 * Provedor `aviao` — o modelo local de requisitos, formato nativo do contrato.
 *
 * `POST {base}/sugerir`, `POST {base}/analisar` e `POST {base}/melhorar`,
 * autenticados por `X-API-Key`. É o único que já devolve tudo pronto: a
 * metodologia está no modelo e a nota de aceitação sai do checklist
 * determinístico do serviço, não do prompt.
 *
 * Vale também para o que acompanha a proposta de melhoria — os `avisos` da
 * guarda e a nota `antes`/`depois` (Parte 3 do contrato): são contas do serviço,
 * então só este formato os traz. Nos demais eles chegam ausentes, e ausentes
 * ficam.
 */

import type {ConfigIaRequisitos} from "@modules/ia-requisitos/config";
import {
  postarJson,
  sanitizarAnaliseNativa,
  sanitizarMelhoriaNativa,
  sanitizarRespostaNativa,
} from "@modules/ia-requisitos/provedores/comum";
import {
  ANALISE_VAZIA,
  MELHORIA_VAZIA,
  RESPOSTA_VAZIA,
  type PedidoAnalise,
  type PedidoIa,
  type PedidoMelhoria,
  type ProvedorDeIa,
  type RespostaAnalise,
  type RespostaIa,
  type RespostaMelhoria,
} from "@modules/ia-requisitos/tipos";

export function criarProvedorAviao(cfg: ConfigIaRequisitos): ProvedorDeIa {
  /** O formato nativo manda o pedido como está: os dois lados falam o contrato. */
  const chamar = (caminho: string, corpo: unknown, tempoLimiteMs = cfg.tempoLimiteMs) =>
    postarJson({
      url: `${cfg.urlBase}${caminho}`,
      cabecalhos: {"X-API-Key": cfg.chave},
      corpo,
      tempoLimiteMs,
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
    async melhorar(pedido: PedidoMelhoria): Promise<RespostaMelhoria> {
      const corpo = await chamar("/melhorar", pedido, cfg.tempoLimiteMelhoriaMs);
      return corpo === null ? MELHORIA_VAZIA : sanitizarMelhoriaNativa(corpo, pedido.texto);
    },
  };
}
