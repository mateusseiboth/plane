/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import useSWR from "swr";
import { ligacoesApi, type LigacoesApi } from "@/services/ligacoes.service";

const SWR_OPTIONS = { revalidateOnFocus: false, keepPreviousData: true } as const;

/** Um `ligacoesApi` por URL do chat-backend (vem da configuração do chat). */
export const useLigacoesApi = (apiUrl: string): LigacoesApi => useMemo(() => ligacoesApi(apiUrl), [apiUrl]);

/**
 * Detalhe da ligação aberta. `versao` muda a cada atividade da sessão (a lista
 * recebe o aviso pelo WS), e é o que faz o painel recarregar sozinho.
 */
export function useLigacao(apiUrl: string, slug: string, sessionId: string, versao: string) {
  const api = useLigacoesApi(apiUrl);
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ["LIGACAO", slug, sessionId, versao],
    () => api.detail(slug, sessionId),
    SWR_OPTIONS
  );
  return { data, error, isLoading, isFetching: isValidating, refetch: mutate, api };
}

export function useHistoricoDoCliente(apiUrl: string, slug: string, sessionId: string, versao: string) {
  const api = useLigacoesApi(apiUrl);
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ["HISTORICO_DO_CLIENTE", slug, sessionId, versao],
    () => api.historico(slug, sessionId),
    SWR_OPTIONS
  );
  return { data: data?.results ?? [], error, isLoading, isFetching: isValidating, refetch: mutate };
}

export function useTelefoniaConfig(apiUrl: string, slug: string) {
  const api = useLigacoesApi(apiUrl);
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ["TELEFONIA_CONFIG", slug],
    () => api.config(slug),
    SWR_OPTIONS
  );
  return { data, error, isLoading, isFetching: isValidating, refetch: mutate, api };
}

export function useRelatorioDeLigacoes(apiUrl: string, slug: string, days: number) {
  const api = useLigacoesApi(apiUrl);
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ["RELATORIO_DE_LIGACOES", slug, days],
    () => api.report(slug, days),
    SWR_OPTIONS
  );
  return { data, error, isLoading, isFetching: isValidating, refetch: mutate };
}
