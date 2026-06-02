/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { KeyRound } from "lucide-react";
// ui
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
// services
import { WorkspaceService } from "@/services/workspace.service";

const workspaceService = new WorkspaceService();

export type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  userDetails: {
    id: string;
    display_name: string;
  };
};

const DEFAULT_PASSWORD = "teste";

export const ResetMemberPasswordModal = observer(function ResetMemberPasswordModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, userDetails } = props;
  // states
  const [password, setPassword] = useState(DEFAULT_PASSWORD);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = () => {
    onClose();
    setPassword(DEFAULT_PASSWORD);
    setIsSubmitting(false);
  };

  const handleSubmit = async () => {
    if (!workspaceSlug || !userDetails.id) return;
    if (password.trim().length < 4) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "A senha precisa ter ao menos 4 caracteres." });
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await workspaceService.resetWorkspaceMemberPassword(workspaceSlug, userDetails.id, password.trim());
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Senha redefinida",
        message: `Nova senha de ${userDetails.display_name}: ${res.password}`,
      });
      handleClose();
    } catch (err: unknown) {
      const error = err as { detail?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Erro",
        message: error?.detail || "Não foi possível redefinir a senha. Tente novamente.",
      });
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-layer-2">
            <KeyRound className="size-5 text-secondary" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <h3 className="text-h5-medium text-primary">Redefinir senha</h3>
            <p className="mt-1 text-sm text-secondary">
              Defina uma nova senha para <span className="font-medium">{userDetails.display_name}</span>. Informe-a ao
              usuário; ele poderá alterá-la depois nas configurações de conta.
            </p>
            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-secondary" htmlFor="reset-password-input">
                Nova senha
              </label>
              <Input
                id="reset-password-input"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nova senha"
                className="w-full"
                autoFocus
              />
            </div>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={handleClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} loading={isSubmitting}>
            {isSubmitting ? "Redefinindo..." : "Redefinir senha"}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
