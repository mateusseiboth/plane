/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
// services
import { widgetService, type IWidget } from "@/services/widget.service";

/** Widgets do marketplace ativos. A chave é a mesma para a grade e para cada cartão instalado. */
export function useWidgetsInstalados() {
  const { data, error, isLoading, isValidating, mutate } = useSWR<IWidget[]>(
    "HOME_MARKETPLACE_WIDGETS",
    async () => (await widgetService.list({ status: "ACTIVE" })).results ?? [],
    { revalidateOnFocus: false, revalidateIfStale: false }
  );
  return { data, error, isLoading, isFetching: isValidating, refetch: mutate };
}
