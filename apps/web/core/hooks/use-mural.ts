/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR, { mutate as mutateGlobal } from "swr";
// components
import { buildMuralQuery, isMuralEvent, MURAL_PUBLISH, type TMuralFiltros } from "@/components/mural/helpers";
// hooks
import { useRealtimeRefetch } from "@/hooks/use-realtime";
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";
// services
import muralService, { type TMuralPagina, type TMuralRecado, type TMuralRecadoPayload } from "@/services/mural.service";

const PREFIXO = "MURAL_";
const HOME_KEY = (slug: string) => `${PREFIXO}HOME_${slug}`;
const PENDENTES_KEY = (slug: string) => `${PREFIXO}PENDENTES_${slug}`;
const HISTORICO_KEY = (slug: string, query: string) => `${PREFIXO}HISTORICO_${slug}_${query}`;
const LEITORES_KEY = (slug: string, id: string) => `${PREFIXO}LEITORES_${slug}_${id}`;

const SWR_OPTIONS = { revalidateOnFocus: false, keepPreviousData: true } as const;

/** Revalida tudo do mural (home, aviso, histórico, leitores) depois de uma escrita ou evento. */
const refreshMural = () => mutateGlobal((key) => typeof key === "string" && key.startsWith(PREFIXO));

/** Recado novo ou alterado por outra pessoa aparece sem recarregar (SSE). */
const useMuralRealtime = () => useRealtimeRefetch(isMuralEvent, () => void refreshMural());

/** Seção da home: não lidos primeiro, fixados sempre. */
export function useMuralHome(slug: string | undefined) {
  useMuralRealtime();
  const { data, error, isLoading, isValidating, mutate } = useSWR<TMuralRecado[]>(
    slug ? HOME_KEY(slug) : null,
    slug ? () => muralService.home(slug) : null,
    SWR_OPTIONS
  );
  return { data, error, isLoading, isFetching: isValidating, refetch: mutate };
}

/** Obrigatórios que quem está logado ainda não confirmou. */
export function useMuralPendentes(slug: string | undefined) {
  useMuralRealtime();
  const { data, error, isLoading, isValidating, mutate } = useSWR<TMuralRecado[]>(
    slug ? PENDENTES_KEY(slug) : null,
    slug ? () => muralService.pendingRequired(slug) : null,
    SWR_OPTIONS
  );
  return { data, error, isLoading, isFetching: isValidating, refetch: mutate };
}

/** Uma página do histórico, com período e (para quem publica) os inativos. */
export function useMuralHistorico(slug: string | undefined, filtros: TMuralFiltros) {
  useMuralRealtime();
  const query = buildMuralQuery(filtros);
  const { data, error, isLoading, isValidating, mutate } = useSWR<TMuralPagina>(
    slug ? HISTORICO_KEY(slug, query) : null,
    slug ? () => muralService.list(slug, query) : null,
    SWR_OPTIONS
  );
  return { data, error, isLoading, isFetching: isValidating, refetch: mutate };
}

/** Um recado pelo id (link da notificação). */
export function useMuralRecado(slug: string | undefined, id: string | null | undefined) {
  const isPronto = !!slug && !!id;
  const { data, error, isLoading, isValidating, mutate } = useSWR<TMuralRecado>(
    isPronto ? `${PREFIXO}RECADO_${slug}_${id}` : null,
    isPronto ? () => muralService.retrieve(slug, id) : null,
    { revalidateOnFocus: false }
  );
  return { data, error, isLoading, isFetching: isValidating, refetch: mutate };
}

/** Quem leu e quem não leu. Só pede quando `enabled` (a rota exige `mural.publish`). */
export function useMuralLeitores(slug: string | undefined, id: string | undefined, enabled: boolean) {
  const isPronto = !!slug && !!id && enabled;
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    isPronto ? LEITORES_KEY(slug, id) : null,
    isPronto ? () => muralService.readers(slug, id) : null,
    { revalidateOnFocus: false }
  );
  return { data, error, isLoading, isFetching: isValidating, refetch: mutate };
}

/** Escritas do mural. Cada uma revalida as listas ao terminar. */
export function useMuralActions(slug: string | undefined) {
  const { can, isLoading } = useMyWorkspaceActions(slug);
  const withRefresh =
    <A extends unknown[], R>(run: (s: string, ...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      const resultado = await run(slug ?? "", ...args);
      await refreshMural();
      return resultado;
    };
  return {
    canPublish: can(MURAL_PUBLISH),
    isLoadingPermissions: isLoading,
    create: withRefresh((s, data: TMuralRecadoPayload) => muralService.create(s, data)),
    update: withRefresh((s, id: string, data: TMuralRecadoPayload) => muralService.update(s, id, data)),
    markRead: withRefresh((s, id: string) => muralService.markRead(s, id)),
  };
}
