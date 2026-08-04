/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
import type { TEntity } from "@plane/types";
// services
import entityService from "@/services/entity.service";

export const WORKSPACE_ENTITIES_KEY = (workspaceSlug: string) => `WORKSPACE_ENTITIES_${workspaceSlug}`;

/**
 * Active entities (clientes/órgãos) of a workspace, shared through the SWR cache
 * so every consumer (filters, dropdowns, columns) hits the API only once.
 */
export const useEntities = (workspaceSlug: string | undefined) => {
  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate: refetch,
  } = useSWR<TEntity[]>(
    workspaceSlug ? WORKSPACE_ENTITIES_KEY(workspaceSlug) : null,
    workspaceSlug ? () => entityService.list(workspaceSlug) : null,
    { revalidateOnFocus: false }
  );

  return {
    entities: data,
    data,
    error,
    isLoading,
    isFetching: isValidating,
    refetch,
  };
};
