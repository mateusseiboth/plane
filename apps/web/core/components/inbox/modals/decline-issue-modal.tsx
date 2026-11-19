/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { useTranslation } from "@plane/i18n";
import type { TIssue } from "@plane/types";
// components
import { ModalDeMotivo } from "@/components/inbox/modals/modal-de-motivo";
import { REGRAS_DA_RECUSA } from "@/components/inbox/modals/regras-do-motivo";
// hooks
import { useProject } from "@/hooks/store/use-project";

type Props = {
  data: Partial<TIssue>;
  isOpen: boolean;
  onClose: () => void;
  /** Recusa com o motivo; a recusa do servidor volta como erro e aparece no campo. */
  onSubmit: (motivo: string) => Promise<void>;
};

/**
 * Recusar exige o motivo: ele vira comentário na solicitação e vai para o sino
 * de quem abriu, que repassa ao cliente.
 */
export function DeclineIssueModal(props: Props) {
  const { isOpen, onClose, data, onSubmit } = props;
  const { getProjectById } = useProject();
  const { t } = useTranslation();
  const projectDetails = data.project_id ? getProjectById(data.project_id) : undefined;

  return (
    <ModalDeMotivo
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={onSubmit}
      regras={REGRAS_DA_RECUSA}
      titulo={t("inbox_issue.modals.decline.title")}
      descricao={
        <>
          Solicitação{" "}
          <span className="font-medium break-words text-primary">
            {projectDetails?.identifier}-{data?.sequence_id}
          </span>
          . Quem abriu recebe o motivo.
        </>
      }
      rotulo="Motivo e orientação"
      placeholder="O que o atendimento deve dizer ao cliente"
      botao={{ texto: t("decline"), enviando: t("declining"), variante: "error-fill" }}
    />
  );
}
