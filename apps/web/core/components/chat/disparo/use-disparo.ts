/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import useSWR from "swr";
import { ChatService } from "@/services/chat.service";
import { disparoApi, type DisparoApi, type FiltrosDoEnvio } from "@/services/disparo.service";

const SWR_OPTIONS = { revalidateOnFocus: false, keepPreviousData: true } as const;
// Envio em andamento: a tela acompanha o worker sem o atendente recarregar.
const ACOMPANHAMENTO_MS = 5000;

const chatService = new ChatService();

/** Endereço do chat-backend (vem da configuração do chat do espaço). */
export function useChatConfig(slug: string) {
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    slug ? ["CHAT_CONFIG", slug] : null,
    () => chatService.getConfig(slug),
    SWR_OPTIONS
  );
  return { data, error, isLoading, isFetching: isValidating, refetch: mutate };
}

export const useDisparoApi = (apiUrl: string): DisparoApi => useMemo(() => disparoApi(apiUrl), [apiUrl]);

export function useMensagensDeDisparo(apiUrl: string, slug: string) {
  const api = useDisparoApi(apiUrl);
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ["DISPARO_MENSAGENS", slug],
    () => api.listMensagens(slug),
    SWR_OPTIONS
  );
  return { data: data ?? [], error, isLoading, isFetching: isValidating, refetch: mutate, api };
}

/** Quantos recebem com os filtros escolhidos: refaz a conta a cada mudança. */
export function usePreviaDoEnvio(apiUrl: string, slug: string, filtros: FiltrosDoEnvio) {
  const api = useDisparoApi(apiUrl);
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ["DISPARO_PREVIA", slug, JSON.stringify(filtros)],
    () => api.previa(slug, filtros),
    SWR_OPTIONS
  );
  return { data, error, isLoading, isFetching: isValidating, refetch: mutate };
}

export function useExecucoesDeDisparo(apiUrl: string, slug: string, mensagemId?: string) {
  const api = useDisparoApi(apiUrl);
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ["DISPARO_EXECUCOES", slug, mensagemId ?? ""],
    () => api.listExecucoes(slug, mensagemId),
    {
      ...SWR_OPTIONS,
      refreshInterval: (atual) => (atual?.some((e) => e.status === "em_andamento") ? ACOMPANHAMENTO_MS : 0),
    }
  );
  return { data: data ?? [], error, isLoading, isFetching: isValidating, refetch: mutate, api };
}

export function useDetalheDoEnvio(apiUrl: string, slug: string, execucaoId: string | null) {
  const api = useDisparoApi(apiUrl);
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    execucaoId ? ["DISPARO_DETALHE", slug, execucaoId] : null,
    () => api.detalhe(slug, execucaoId!),
    { ...SWR_OPTIONS, refreshInterval: (atual) => (atual?.status === "em_andamento" ? ACOMPANHAMENTO_MS : 0) }
  );
  return { data, error, isLoading, isFetching: isValidating, refetch: mutate, api };
}

export function useFilaZapi(apiUrl: string, slug: string) {
  const api = useDisparoApi(apiUrl);
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ["DISPARO_FILA_ZAPI", slug],
    () => api.filaZapi(slug),
    SWR_OPTIONS
  );
  return { data: data ?? [], error, isLoading, isFetching: isValidating, refetch: mutate };
}

export function useConfigDoDisparo(apiUrl: string, slug: string) {
  const api = useDisparoApi(apiUrl);
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ["DISPARO_CONFIG", slug],
    () => api.config(slug),
    SWR_OPTIONS
  );
  return { data, error, isLoading, isFetching: isValidating, refetch: mutate, api };
}
