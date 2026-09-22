/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
// services
import linksUteisService, { type TGrupoDeLinks } from "@/services/links-uteis.service";

export const LINKS_UTEIS_KEY = (workspaceSlug: string) => `LINKS_UTEIS_${workspaceSlug}`;

/** Links úteis do espaço, já recortados pelo que esta pessoa pode ver. */
export function useLinksUteis(workspaceSlug: string | undefined) {
  const key = workspaceSlug ? LINKS_UTEIS_KEY(workspaceSlug) : null;
  const { data, error, isLoading, isValidating, mutate } = useSWR<TGrupoDeLinks[]>(
    key,
    key ? () => linksUteisService.list(workspaceSlug!) : null,
    { revalidateOnFocus: false }
  );
  return { grupos: data ?? [], data, error, isLoading, isFetching: isValidating, refetch: mutate };
}
