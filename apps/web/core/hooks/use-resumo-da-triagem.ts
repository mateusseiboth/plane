/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import useSWR, { mutate as mutateGlobal } from "swr";
// components
import {
  isEventoDoResumoDaTriagem,
  isMarcarComoVisto,
  readResolvidasNaoVistas,
} from "@/components/inbox/global/resumo-da-triagem";
// hooks
import { useUser } from "@/hooks/store/user";
import { useRealtimeRefetch } from "@/hooks/use-realtime";
// services
import { InboxIssueService } from "@/services/inbox/inbox-issue.service";

const inboxIssueService = new InboxIssueService();

const buildChaveDoResumo = (slug: string) => `RESUMO_DA_TRIAGEM_${slug}`;

/**
 * Solicitações da pessoa já resolvidas e que ela ainda não viu: o número do
 * item Solicitação/Triagem do menu. Revalida ao voltar para a aba e quando
 * chega mudança de solicitação ou de chamado pelo tempo real.
 */
export function useResumoDaTriagem(slug: string | undefined) {
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    slug ? buildChaveDoResumo(slug) : null,
    slug ? () => inboxIssueService.readResumoDaTriagem(slug) : null,
    { revalidateOnFocus: true, refreshInterval: 5 * 60_000 }
  );
  useRealtimeRefetch(isEventoDoResumoDaTriagem, () => void mutate());
  return {
    resolvidasNaoVistas: readResolvidasNaoVistas(data),
    data,
    error,
    isLoading,
    isFetching: isValidating,
    refetch: mutate,
  };
}

type TSolicitacaoVista = { issueId: string; autorId: string | null | undefined; isResolvida: boolean };

/**
 * Marca como vista a solicitação resolvida que quem a abriu está olhando, e
 * põe no menu o número que a API devolve na mesma hora. Outra pessoa olhando
 * não marca nada.
 */
export function useVistoDaSolicitacao(slug: string | undefined) {
  const { data: usuario } = useUser();
  const userId = usuario?.id;
  const markVisto = useCallback(
    async ({ issueId, autorId, isResolvida }: TSolicitacaoVista) => {
      if (!slug || !isMarcarComoVisto({ autorId, userId, isResolvida })) return;
      try {
        const resumo = await inboxIssueService.markSolicitacaoVista(slug, issueId);
        await mutateGlobal(buildChaveDoResumo(slug), resumo, { revalidate: false });
      } catch (error) {
        // Marcar como vista é só o número do menu: falhar não pode atrapalhar a tela.
        console.error("Falha ao marcar a solicitação como vista", error);
      }
    },
    [slug, userId]
  );
  return { markVisto };
}
