"use client";

/**
 * Modal de solicitação avulsa (sem conversa), controlado por quem o monta:
 * `isOpen`/`onClose`. Envia pela rota padrão (`POST .../inbox-issues/`) e
 * lista TODOS os sistemas do espaço (`GET /sistemas-para-solicitacao/`): o
 * Atendimento abre pedido para qualquer sistema, como pela conversa do chat.
 */
import { useState } from "react";
import useSWR from "swr";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// components
import { bindArquivosDaSolicitacao } from "@/components/solicitacao/arquivos-da-solicitacao";
import {
  buildConfirmacaoDaSolicitacao,
  type ConfirmacaoDaSolicitacao,
  type SolicitacaoAberta,
} from "@/components/solicitacao/confirmacao-da-solicitacao";
import type { ErroDoCampo, PedidoDeSolicitacao } from "@/components/solicitacao/formulario-da-solicitacao";
import { ModalDeSolicitacao } from "@/components/solicitacao/modal-de-solicitacao";
// hooks
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";
// services
import { InboxIssueService } from "@/services/inbox";

const inboxIssueService = new InboxIssueService();

type Recusa = { detail?: string; errors?: ErroDoCampo[] };

type Props = {
  workspaceSlug: string;
  isOpen: boolean;
  onClose: () => void;
  /** Sistema já escolhido pela tela de onde veio (triagem de um sistema, quadro). */
  projectIdInicial?: string | null;
};

export function ModalDeSolicitacaoAvulsa({ workspaceSlug, isOpen, onClose, projectIdInicial }: Props) {
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState<ErroDoCampo[]>([]);
  const [confirmacao, setConfirmacao] = useState<ConfirmacaoDaSolicitacao | null>(null);
  const { can } = useMyWorkspaceActions(workspaceSlug);
  const { data: sistemas } = useSWR(
    isOpen && can("intake.create") ? `SISTEMAS_PARA_SOLICITACAO_${workspaceSlug}` : null,
    () => inboxIssueService.listSistemasParaSolicitacao(workspaceSlug),
    { revalidateOnFocus: false }
  );

  const projetos = (sistemas ?? []).map((sistema) => ({ value: sistema.id, label: sistema.name }));

  const close = () => {
    setErros([]);
    setConfirmacao(null);
    onClose();
  };

  const createSolicitacao = async ({ projectId, dados, assetIds }: PedidoDeSolicitacao) => {
    setEnviando(true);
    setErros([]);
    try {
      const criada = await inboxIssueService.create(workspaceSlug, projectId, dados);
      await bindArquivosDaSolicitacao(workspaceSlug, projectId, criada.issue.id, assetIds);
      // O modal fica aberto com o número: o atendimento copia e passa ao cliente.
      const aberta = criada.issue as SolicitacaoAberta;
      setConfirmacao(buildConfirmacaoDaSolicitacao(aberta, dados.priority === "urgent"));
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

  if (!isOpen) return null;
  const projectId = projectIdInicial ?? (projetos.length === 1 ? projetos[0].value : "");
  return (
    <ModalDeSolicitacao
      workspaceSlug={workspaceSlug}
      titulo="Nova solicitação"
      rotuloDoEnvio="Abrir solicitação"
      projetos={projetos}
      inicial={{ projectId }}
      erros={erros}
      enviando={enviando}
      confirmacao={confirmacao}
      onConfirmar={(pedido) => void createSolicitacao(pedido)}
      onCancelar={close}
    />
  );
}
