/**
 * Sugestões da wiki no modal de solicitação.
 *
 * `useSugestoesDaWiki` busca enquanto a pessoa descreve o problema: espera
 * 600 ms depois da última tecla e só pergunta ao servidor com três palavras ou
 * mais. `useSugestaoDeSolucao` é uma ação (o clique em "Sugerir solução"), daí
 * `useSWRMutation`, como em `useMelhoriaDeTexto`.
 */
import { useCallback } from "react";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
// components
import {
  ATRASO_DA_BUSCA_NA_WIKI_MS,
  isHoraDeBuscarNaWiki,
  type TSugestaoDaWiki,
  type TSugestaoDeSolucao,
} from "@/components/solicitacao/sugestoes-da-wiki";
// hooks
import useDebounce from "@/hooks/use-debounce";
// services
import wikiSugestoesService from "@/services/wiki-sugestoes.service";

const OPCOES = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  shouldRetryOnError: false,
  keepPreviousData: true,
};

export const useSugestoesDaWiki = (workspaceSlug: string | undefined, texto: string, projectId?: string) => {
  const textoParado = useDebounce(texto, ATRASO_DA_BUSCA_NA_WIKI_MS);
  const chave =
    workspaceSlug && isHoraDeBuscarNaWiki(textoParado)
      ? ["SUGESTOES_DA_WIKI", workspaceSlug, textoParado, projectId ?? ""]
      : null;

  const { data, error, isLoading, isValidating, mutate } = useSWR<TSugestaoDaWiki[]>(
    chave,
    () => wikiSugestoesService.listSugestoes(workspaceSlug ?? "", textoParado, projectId),
    OPCOES
  );

  return {
    /** `undefined` enquanto não houve busca (texto curto) ou ela não voltou. */
    sugestoes: chave ? data : undefined,
    textoBuscado: textoParado,
    data,
    error,
    isLoading,
    isFetching: isValidating,
    refetch: mutate,
  };
};

type TPedidoDeSolucao = { texto: string; paginaIds: string[] };

export const useSugestaoDeSolucao = (workspaceSlug: string | undefined) => {
  const { data, error, isMutating, trigger, reset } = useSWRMutation(
    workspaceSlug ? ["SUGESTAO_DE_SOLUCAO_DA_WIKI", workspaceSlug] : null,
    (_chave: unknown, { arg }: { arg: TPedidoDeSolucao }): Promise<TSugestaoDeSolucao> =>
      wikiSugestoesService.resolveSugestao(workspaceSlug ?? "", arg.texto, arg.paginaIds)
  );

  const ask = useCallback(async (pedido: TPedidoDeSolucao) => trigger(pedido), [trigger]);

  return { solucao: data, data, error, isMutating, ask, reset };
};
