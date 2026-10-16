/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useState } from "react";
import useSWR from "swr";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// components
import type { ErroDoCampo, PedidoDeSolicitacao } from "@/components/solicitacao/formulario-da-solicitacao";
import { ModalDeSolicitacao } from "@/components/solicitacao/modal-de-solicitacao";
// hooks
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";
// services
import { InboxIssueService } from "@/services/inbox";

const inboxIssueService = new InboxIssueService();

type Recusa = { detail?: string; errors?: ErroDoCampo[] } | null | undefined;

/**
 * Estratégia "avulsa" do modal de solicitação: o botão "Nova solicitação" da
 * barra lateral, sem conversa. Envia pela rota padrão da triagem
 * (`POST .../inbox-issues/`). Os sistemas são TODOS os do espaço, sem vínculo
 * (`GET /sistemas-para-solicitacao/`): o Atendimento abre pedido para qualquer
 * sistema, como pela conversa do chat.
 */
export function useSolicitacaoAvulsa(workspaceSlug: string | undefined) {
  const [aberta, setAberta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState<ErroDoCampo[]>([]);
  const { can } = useMyWorkspaceActions(workspaceSlug);
  const { data: sistemas } = useSWR(
    aberta && workspaceSlug && can("intake.create") ? `SISTEMAS_PARA_SOLICITACAO_${workspaceSlug}` : null,
    () => inboxIssueService.listSistemasParaSolicitacao(workspaceSlug!),
    { revalidateOnFocus: false }
  );

  const projetos = (sistemas ?? []).map((sistema) => ({ value: sistema.id, label: sistema.name }));

  const close = () => {
    setErros([]);
    setAberta(false);
  };

  const createSolicitacao = async ({ projectId, dados }: PedidoDeSolicitacao) => {
    if (!workspaceSlug) return;
    setEnviando(true);
    setErros([]);
    try {
      await inboxIssueService.create(workspaceSlug, projectId, dados);
      close();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Solicitação aberta", message: "Ela está na triagem do sistema." });
    } catch (e) {
      const recusa = e as Recusa;
      setErros(recusa?.errors ?? []);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Solicitação não aberta",
        message: recusa?.detail ?? "Tente de novo.",
      });
    } finally {
      setEnviando(false);
    }
  };

  const modalDaSolicitacao = aberta && workspaceSlug && (
    <ModalDeSolicitacao
      workspaceSlug={workspaceSlug}
      titulo="Nova solicitação"
      rotuloDoEnvio="Abrir solicitação"
      projetos={projetos}
      inicial={{ projectId: projetos.length === 1 ? projetos[0].value : "" }}
      erros={erros}
      enviando={enviando}
      onConfirmar={(pedido) => void createSolicitacao(pedido)}
      onCancelar={close}
    />
  );

  return { openSolicitacao: () => setAberta(true), modalDaSolicitacao };
}
