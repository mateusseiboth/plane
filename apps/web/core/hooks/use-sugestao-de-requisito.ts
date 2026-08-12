/**
 * Sugestão da IA de levantamento de requisitos para o campo que está sendo
 * escrito. Contrato: `.claude/CONTRATO_IA_REQUISITOS.md`.
 *
 * Três cuidados moram aqui:
 *
 * 1. **Silêncio antes de perguntar.** Só depois de `ATRASO_MS` sem digitar é
 *    que a chave do SWR muda e a chamada sai. Pedir a cada tecla é inutilizável
 *    e caro.
 * 2. **Só o campo em foco pergunta.** O contexto da descrição inclui o título;
 *    sem essa trava, digitar o título dispararia os dois pedidos.
 * 3. **O checklist sobrevive ao foco.** O fantasma some quando a pessoa sai do
 *    campo, mas "o que ainda falta" continua valendo — fica guardado na última
 *    resposta boa.
 */
import { useRef } from "react";
import useSWR from "swr";
// hooks
import useDebounce from "@/hooks/use-debounce";
// services
import type {
  TCampoDeRequisito,
  TItemFaltante,
  TPedidoDeSugestao,
  TSugestaoDeRequisito,
} from "@/services/sugestao-de-requisito.service";
import sugestaoDeRequisitoService, { SEM_SUGESTAO } from "@/services/sugestao-de-requisito.service";

export const SUGESTAO_DE_REQUISITO_KEY = (workspaceSlug: string, pedido: string) =>
  `SUGESTAO_DE_REQUISITO_${workspaceSlug}_${pedido}`;

/** Silêncio de teclado antes de perguntar à IA. */
const ATRASO_MS = 600;

/**
 * Abaixo disso não há o que sugerir e o pedido só gastaria o modelo. A
 * descrição é a exceção: vazia, com um título decente, é exatamente quando a
 * sugestão mais ajuda.
 */
const TEM_SINAL: Record<TCampoDeRequisito, (pedido: TPedidoDeSugestao) => boolean> = {
  titulo: (pedido) => pedido.texto_atual.trim().length >= 3,
  descricao: (pedido) => pedido.texto_atual.trim().length >= 3 || (pedido.contexto.titulo ?? "").trim().length >= 5,
  comentario: (pedido) => pedido.texto_atual.trim().length >= 3,
};

type TParametros = {
  workspaceSlug: string | undefined;
  /** Normalmente "o campo está em foco". */
  habilitado: boolean;
  pedido: TPedidoDeSugestao;
};

export const useSugestaoDeRequisito = (params: TParametros) => {
  const { workspaceSlug, habilitado, pedido } = params;
  // última lista de pendências conhecida, para o checklist não piscar no blur
  const ultimoFaltando = useRef<TItemFaltante[]>([]);

  // sem projeto nem chamado a rota responde 400: não há contra o que conferir
  // permissão. Melhor não perguntar do que colecionar erro.
  const temAlvo = Boolean(pedido.project_id || pedido.issue_id);
  const deveperguntar = Boolean(workspaceSlug) && habilitado && temAlvo && TEM_SINAL[pedido.campo](pedido);
  const pedidoSerializado = deveperguntar ? JSON.stringify(pedido) : null;
  const pedidoComAtraso = useDebounce(pedidoSerializado, ATRASO_MS);
  const corpo = deveperguntar ? pedidoComAtraso : null;

  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate: refetch,
  } = useSWR<TSugestaoDeRequisito>(
    workspaceSlug && corpo ? SUGESTAO_DE_REQUISITO_KEY(workspaceSlug, corpo) : null,
    workspaceSlug && corpo ? () => sugestaoDeRequisitoService.sugerir(workspaceSlug, JSON.parse(corpo)) : null,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      shouldRetryOnError: false,
      keepPreviousData: false,
    }
  );

  if (data?.faltando?.length) ultimoFaltando.current = data.faltando;

  const resposta = data ?? SEM_SUGESTAO;

  return {
    /** Texto a desenhar em cinza. Vazio sempre que a IA não tem o que dizer. */
    sugestao: habilitado ? resposta.sugestao : "",
    faltando: resposta.faltando.length > 0 ? resposta.faltando : ultimoFaltando.current,
    data,
    error,
    isLoading,
    isFetching: isValidating,
    refetch,
  };
};
