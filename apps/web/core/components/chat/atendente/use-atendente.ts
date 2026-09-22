/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import useSWR from "swr";
import { atendenteApi, type AtendenteApi, type FiltroDoGerenciador } from "@/services/atendente.service";
import { chatApi } from "@/services/chat.service";

const SWR_OPTIONS = { revalidateOnFocus: false, keepPreviousData: true } as const;

/** O monitor é "ao vivo": revalida sozinho a cada 10 segundos. */
const MONITOR_INTERVALO_MS = 10_000;

/** Um `atendenteApi` por URL do chat-backend (vem da configuração do chat). */
export const useAtendenteApi = (apiUrl: string): AtendenteApi => useMemo(() => atendenteApi(apiUrl), [apiUrl]);

export function useFrasesProntas(apiUrl: string, slug: string) {
  const api = useAtendenteApi(apiUrl);
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ["CHAT_FRASES", apiUrl, slug],
    () => api.frases(slug),
    SWR_OPTIONS
  );
  return { frases: data?.results ?? [], data, error, isLoading, isFetching: isValidating, refetch: mutate, api };
}

/** `versao` muda a cada atividade da conversa: o painel recarrega sozinho. */
export function useCadastroDaConversa(apiUrl: string, slug: string, sessionId: string, versao: string) {
  const api = useAtendenteApi(apiUrl);
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ["CHAT_CADASTRO_DA_CONVERSA", apiUrl, slug, sessionId, versao],
    () => api.cadastro(slug, sessionId),
    SWR_OPTIONS
  );
  return { cadastro: data, data, error, isLoading, isFetching: isValidating, refetch: mutate, api };
}

export function useFeriados(apiUrl: string, slug: string) {
  const api = useAtendenteApi(apiUrl);
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ["CHAT_FERIADOS", apiUrl, slug],
    () => api.feriados(slug),
    SWR_OPTIONS
  );
  return { feriados: data?.results, data, error, isLoading, isFetching: isValidating, refetch: mutate, api };
}

export function useGerenciador(apiUrl: string, slug: string, filtro: FiltroDoGerenciador) {
  const api = useAtendenteApi(apiUrl);
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ["CHAT_GERENCIADOR", apiUrl, slug, JSON.stringify(filtro)],
    () => api.gerenciador(slug, filtro),
    SWR_OPTIONS
  );
  return { pagina: data, data, error, isLoading, isFetching: isValidating, refetch: mutate, api };
}

export function useMonitor(apiUrl: string, slug: string) {
  const api = useAtendenteApi(apiUrl);
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ["CHAT_MONITOR", apiUrl, slug],
    () => api.monitor(slug),
    { ...SWR_OPTIONS, refreshInterval: MONITOR_INTERVALO_MS }
  );
  return { monitor: data, data, error, isLoading, isFetching: isValidating, refetch: mutate };
}

/** Quem atende no espaço (filtro do gerenciador). */
export function useAtendentesDoChat(apiUrl: string, slug: string) {
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ["CHAT_ATENDENTES", apiUrl, slug],
    () => chatApi(apiUrl).attendants(slug),
    SWR_OPTIONS
  );
  return { atendentes: data?.results ?? [], data, error, isLoading, isFetching: isValidating, refetch: mutate };
}
