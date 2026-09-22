/**
 * Chaves e colunas dos painéis de TV (Configurações do espaço). SWR, como o
 * resto das telas de configuração.
 */
import useSWR from "swr";
import paineisDeTvService, { type TChaveDePainel, type TColunasDoPainel } from "@/services/painel-tv.service";

export function useChavesDePainel(workspaceSlug: string, habilitado: boolean) {
  const { data, error, isLoading, mutate } = useSWR<TChaveDePainel[]>(
    habilitado && workspaceSlug ? ["PAINEL_TV_CHAVES", workspaceSlug] : null,
    () => paineisDeTvService.chaves(workspaceSlug)
  );
  return { chaves: data ?? [], error, isLoading, refetch: mutate };
}

export function useColunasDoPainel(workspaceSlug: string, painel: string, habilitado: boolean) {
  const { data, error, isLoading, mutate } = useSWR<TColunasDoPainel>(
    habilitado && workspaceSlug ? ["PAINEL_TV_COLUNAS", workspaceSlug, painel] : null,
    () => paineisDeTvService.colunas(workspaceSlug, painel)
  );
  return { configuracao: data, error, isLoading, refetch: mutate };
}
