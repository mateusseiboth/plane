/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
// components
import { isEventoDoResumoDaTriagem, readResolvidasParaAtender } from "@/components/inbox/global/resumo-da-triagem";
// hooks
import { useRealtimeRefetch } from "@/hooks/use-realtime";
// services
import { InboxIssueService } from "@/services/inbox/inbox-issue.service";

const inboxIssueService = new InboxIssueService();

/**
 * Solicitações da pessoa já resolvidas e ainda não atendidas: o número do item
 * Solicitação/Triagem do menu. Revalida ao voltar para a aba e quando chega
 * mudança de solicitação ou de chamado pelo tempo real.
 */
export function useResumoDaTriagem(slug: string | undefined) {
  const chave = slug ? `RESUMO_DA_TRIAGEM_${slug}` : null;
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    chave,
    slug ? () => inboxIssueService.readResumoDaTriagem(slug) : null,
    { revalidateOnFocus: true, refreshInterval: 5 * 60_000 }
  );
  useRealtimeRefetch(isEventoDoResumoDaTriagem, () => void mutate());
  return {
    resolvidasParaAtender: readResolvidasParaAtender(data),
    data,
    error,
    isLoading,
    isFetching: isValidating,
    refetch: mutate,
  };
}
