/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TIssue } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore, TextArea } from "@plane/ui";
// components
import { findPendenciaDoMotivo, readErroDoMotivo } from "@/components/inbox/modals/motivo-da-recusa";
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
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string>();
  const [isDeclining, setIsDeclining] = useState(false);
  const { getProjectById } = useProject();
  const { t } = useTranslation();
  const projectDetails = data.project_id ? getProjectById(data.project_id) : undefined;
  const pendencia = findPendenciaDoMotivo(motivo);

  const handleClose = () => {
    setMotivo("");
    setErro(undefined);
    setIsDeclining(false);
    onClose();
  };

  const handleDecline = async () => {
    setIsDeclining(true);
    setErro(undefined);
    try {
      await onSubmit(motivo.trim());
      setMotivo("");
    } catch (e) {
      setErro(readErroDoMotivo(e as Parameters<typeof readErroDoMotivo>[0]));
    } finally {
      setIsDeclining(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="space-y-3 p-5">
        <h3 className="text-16 font-medium">{t("inbox_issue.modals.decline.title")}</h3>
        <p className="text-13 text-secondary">
          Solicitação{" "}
          <span className="font-medium break-words text-primary">
            {projectDetails?.identifier}-{data?.sequence_id}
          </span>
          . Quem abriu recebe o motivo.
        </p>
        <label className="block">
          <span className="mb-1 block text-12 font-medium text-secondary">Motivo e orientação</span>
          <TextArea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="O que o atendimento deve dizer ao cliente"
            rows={4}
            hasError={Boolean(erro)}
            className="w-full"
          />
          {erro && <span className="mt-1 block text-11 text-danger-primary">{erro}</span>}
        </label>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t-[0.5px] border-subtle px-5 py-4 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={handleClose}>
          Cancelar
        </Button>
        <Button
          variant="error-fill"
          onClick={() => void handleDecline()}
          loading={isDeclining}
          disabled={Boolean(pendencia) || isDeclining}
          title={pendencia}
        >
          {isDeclining ? t("declining") : t("decline")}
        </Button>
      </div>
    </ModalCore>
  );
}
