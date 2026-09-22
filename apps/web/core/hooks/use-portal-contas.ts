/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
// services
import portalContasService, { type TListaDeContas, type TPortalDoChamado } from "@/services/portal-contas.service";

export const PORTAL_CONTAS_KEY = (workspaceSlug: string) => `PORTAL_CONTAS_${workspaceSlug}`;

/** As contas do portal do espaço (tela de Configurações). */
export const usePortalContas = (workspaceSlug: string | undefined, enabled = true) => {
  const key = workspaceSlug && enabled ? PORTAL_CONTAS_KEY(workspaceSlug) : null;
  const { data, error, isLoading, isValidating, mutate } = useSWR<TListaDeContas>(
    key,
    key ? () => portalContasService.list(workspaceSlug!) : null,
    { revalidateOnFocus: false }
  );
  return {
    contas: data?.results ?? [],
    emailLigado: data?.email_enabled ?? false,
    data,
    error,
    isLoading,
    isFetching: isValidating,
    refetch: mutate,
  };
};

/** A conta que abriu o chamado pelo portal e as avaliações dela; `null` quando não veio do portal. */
export const usePortalDoChamado = (workspaceSlug: string | undefined, issueId: string | undefined) => {
  const key = workspaceSlug && issueId ? `PORTAL_DO_CHAMADO_${workspaceSlug}_${issueId}` : null;
  const { data, error, isLoading, isValidating, mutate } = useSWR<TPortalDoChamado | null>(
    key,
    key ? () => portalContasService.readDoChamado(workspaceSlug!, issueId!) : null,
    { revalidateOnFocus: true }
  );
  return { data, error, isLoading, isFetching: isValidating, refetch: mutate };
};
