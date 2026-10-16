/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import type { EIssuesStoreType, TIssue } from "@plane/types";
// plane web imports
import { ModalDeSolicitacaoAvulsa } from "@/components/solicitacao/modal-de-solicitacao-avulsa";
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";
import { isSolicitacaoNoLugarDoChamado } from "@/lib/permissoes/regras-de-chamado";
import { IssueModalProvider } from "@/plane-web/components/issues/issue-modal/provider";
import { CreateUpdateIssueModalBase } from "./base";

export interface IssuesModalProps {
  data?: Partial<TIssue>;
  isOpen: boolean;
  onClose: () => void;
  beforeFormSubmit?: () => Promise<void>;
  onSubmit?: (res: TIssue) => Promise<void>;
  withDraftIssueWrapper?: boolean;
  storeType?: EIssuesStoreType;
  isDraft?: boolean;
  fetchIssueDetails?: boolean;
  moveToIssue?: boolean;
  modalTitle?: string;
  primaryButtonText?: {
    default: string;
    loading: string;
  };
  isProjectSelectionDisabled?: boolean;
  templateId?: string;
  allowedProjectIds?: string[];
  showActionItemsOnUpdate?: boolean;
}

export const CreateUpdateIssueModal = observer(function CreateUpdateIssueModal(props: IssuesModalProps) {
  // router params
  const { workspaceSlug, cycleId, moduleId } = useParams();
  // Quem só abre pedidos vê SEMPRE o modal de solicitação, venha de onde vier o
  // clique (barra, triagem do sistema, estado vazio, tecla C). Decisão única aqui.
  const { can } = useMyWorkspaceActions(workspaceSlug?.toString());
  const slug = workspaceSlug?.toString();
  // derived values
  const dataForPreload = {
    ...props.data,
    cycle_id: props.data?.cycle_id ? props.data?.cycle_id : cycleId ? cycleId.toString() : null,
    module_ids: props.data?.module_ids ? props.data?.module_ids : moduleId ? [moduleId.toString()] : null,
  };

  if (!props.isOpen) return null;
  if (slug && isSolicitacaoNoLugarDoChamado(can, Boolean(props.data?.id)))
    return (
      <ModalDeSolicitacaoAvulsa
        workspaceSlug={slug}
        isOpen
        onClose={props.onClose}
        projectIdInicial={props.data?.project_id ?? null}
      />
    );
  return (
    <IssueModalProvider
      templateId={props.templateId}
      dataForPreload={dataForPreload}
      allowedProjectIds={props.allowedProjectIds}
    >
      <CreateUpdateIssueModalBase {...props} />
    </IssueModalProvider>
  );
});
