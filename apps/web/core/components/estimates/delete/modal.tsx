/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// ui
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
// hooks
import { useProjectEstimates } from "@/hooks/store/estimates";
import { useEstimate } from "@/hooks/store/estimates/use-estimate";
import { useProject } from "@/hooks/store/use-project";

type TDeleteEstimateModal = {
  workspaceSlug: string;
  projectId: string;
  estimateId: string | undefined;
  isOpen: boolean;
  handleClose: () => void;
};

export const DeleteEstimateModal = observer(function DeleteEstimateModal(props: TDeleteEstimateModal) {
  // props
  const { workspaceSlug, projectId, estimateId, isOpen, handleClose } = props;
  // hooks
  const { areEstimateEnabledByProjectId, deleteEstimate } = useProjectEstimates();
  const { asJson: estimate } = useEstimate(estimateId);
  const { updateProject } = useProject();
  // states
  const [buttonLoader, setButtonLoader] = useState(false);

  const handleDeleteEstimate = async () => {
    try {
      if (!workspaceSlug || !projectId || !estimateId) return;
      setButtonLoader(true);
      await deleteEstimate(workspaceSlug, projectId, estimateId);
      if (areEstimateEnabledByProjectId(projectId)) {
        await updateProject(workspaceSlug, projectId, { estimate: null });
      }
      setButtonLoader(false);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Estimativa excluída",
        message: "A estimativa foi removida do seu projeto.",
      });
      handleClose();
    } catch (_error) {
      setButtonLoader(false);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Falha ao criar estimativa",
        message: "Não foi possível excluir a estimativa, tente novamente.",
      });
    }
  };

  return (
    <ModalCore isOpen={isOpen} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      <div className="relative space-y-6 py-5">
        {/* heading */}
        <div className="relative flex items-center justify-between gap-2 px-5">
          <div className="text-18 font-medium text-primary">Excluir sistema de estimativa</div>
        </div>

        {/* estimate steps */}
        <div className="px-5">
          <div className="text-14 text-secondary">
            Excluindo a estimativa <span className="font-bold text-primary">{estimate?.name}</span>
            &nbsp;o sistema vai removê-la de todos os chamados definitivamente. Esta ação não pode ser desfeita. Se
            você usar estimativas de novo, será preciso atualizar todos os chamados.
          </div>
        </div>

        <div className="relative flex items-center justify-end gap-3 border-t border-subtle px-5 pt-5">
          <Button variant="secondary" size="lg" onClick={handleClose} disabled={buttonLoader}>
            Cancelar
          </Button>
          <Button variant="error-fill" size="lg" onClick={handleDeleteEstimate} disabled={buttonLoader}>
            {buttonLoader ? "Excluindo" : "Excluir estimativa"}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
