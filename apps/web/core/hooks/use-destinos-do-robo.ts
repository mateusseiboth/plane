/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
// services
import type { chatApi, ChatDestino } from "@/services/chat.service";

/** Catálogo de destinos do chat (exige `chat.administrar`, como a tela de configuração). */
export function useDestinosDoRobo(api: ReturnType<typeof chatApi>, slug: string) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<ChatDestino[]>(
    slug ? ["CHAT_DESTINOS_DO_ROBO", api.base, slug] : null,
    () => api.listDestinos(slug),
    { revalidateOnFocus: false }
  );
  return { destinos: data ?? [], data, error, isLoading, isFetching: isValidating, refetch: mutate };
}
