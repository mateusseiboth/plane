/**
 * Configuração da IA de requisitos do espaço de trabalho.
 *
 * Lida uma vez e compartilhada por todas as telas que consultam a IA — o SWR
 * junta os pedidos pela chave, então chamar este hook em seis componentes
 * continua sendo uma requisição só.
 *
 * Sem resposta (rota ainda não existe, erro, rede fora) valem os padrões do
 * contrato. Isso não "liga" nada sozinho: a rota de análise também degrada para
 * vazio, e resposta vazia não desenha nada.
 */
import { useCallback } from "react";
import useSWR from "swr";
// services
import type { TConfiguracaoDeIa, TConfiguracaoDeIaLida } from "@/services/configuracao-de-ia.service";
import configuracaoDeIaService, { CONFIGURACAO_DE_IA_PADRAO } from "@/services/configuracao-de-ia.service";

export const CONFIGURACAO_DE_IA_KEY = (workspaceSlug: string) => `CONFIGURACAO_DE_IA_${workspaceSlug}`;

export const useConfiguracaoDeIa = (workspaceSlug: string | undefined) => {
  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate: refetch,
  } = useSWR<TConfiguracaoDeIaLida>(
    workspaceSlug ? CONFIGURACAO_DE_IA_KEY(workspaceSlug) : null,
    workspaceSlug ? () => configuracaoDeIaService.ler(workspaceSlug) : null,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
    }
  );

  /**
   * Grava e atualiza o cache com o que o servidor devolveu — não com o que foi
   * enviado. A escrita é parcial e o servidor mescla; só ele sabe o resultado.
   */
  const salvar = useCallback(
    async (valores: Partial<TConfiguracaoDeIa>) => {
      if (!workspaceSlug) return;
      const salva = await configuracaoDeIaService.salvar(workspaceSlug, valores);
      await refetch(salva, { revalidate: false });
      return salva;
    },
    [workspaceSlug, refetch]
  );

  return {
    /** Nunca `undefined`: sem resposta valem os padrões do contrato. */
    configuracao: (data ?? CONFIGURACAO_DE_IA_PADRAO) as TConfiguracaoDeIa,
    /**
     * `undefined` enquanto não se sabe. Só vale avisar que não há IA no
     * servidor depois que o servidor confirmou que não há.
     */
    iaDisponivel: data?.ia_disponivel,
    data,
    error,
    isLoading,
    isFetching: isValidating,
    refetch,
    salvar,
  };
};
