/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { X } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { Dialog, EDialogWidth } from "@plane/propel/dialog";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// services
import portalContasService from "@/services/portal-contas.service";
// local imports
import type { TPortalConta } from "./portal-conta-rules";

type Props = {
  workspaceSlug: string;
  conta: TPortalConta | null;
  /** Há SMTP configurado? Sem ele, só a senha provisória. */
  emailLigado: boolean;
  onClose: () => void;
};

/**
 * Redefinir a senha da conta do portal: link por e-mail (quando há SMTP) ou
 * senha provisória, mostrada uma vez só para o administrador repassar.
 */
export function PortalSenhaModal({ workspaceSlug, conta, emailLigado, onClose }: Props) {
  const [enviando, setEnviando] = useState<"email" | "provisoria" | null>(null);
  const [provisoria, setProvisoria] = useState<string | null>(null);

  // A senha provisória sai da tela junto com o diálogo: ela não aparece de novo.
  const close = () => {
    setProvisoria(null);
    onClose();
  };

  const reset = async (modo: "email" | "provisoria") => {
    if (!conta) return;
    setEnviando(modo);
    try {
      const resultado = await portalContasService.resetPassword(workspaceSlug, conta.id, modo);
      if (resultado.mode === "provisoria") {
        setProvisoria(resultado.password);
        return;
      }
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Enviado", message: resultado.detail });
      close();
    } catch (error) {
      const message = (error as { detail?: string })?.detail ?? "Não foi possível redefinir a senha.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message });
    } finally {
      setEnviando(null);
    }
  };

  const copy = async () => {
    if (!provisoria) return;
    await navigator.clipboard.writeText(provisoria).catch(() => undefined);
    setToast({ type: TOAST_TYPE.SUCCESS, title: "Copiada", message: "Senha copiada." });
  };

  return (
    <Dialog open={Boolean(conta)} onOpenChange={(valor) => !valor && close()}>
      <Dialog.Panel width={EDialogWidth.LG}>
        <div className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title>Redefinir senha</Dialog.Title>
            <button type="button" onClick={close} className="rounded p-1 text-secondary hover:bg-surface-2">
              <X className="h-4 w-4" />
            </button>
          </div>

          {provisoria ? (
            <div className="space-y-3">
              <p className="text-13 text-secondary">
                Senha provisória de {conta?.name}. Ela não aparece de novo: repasse ao cliente agora.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded border border-subtle bg-surface-2 px-3 py-2 text-14">{provisoria}</code>
                <Button variant="secondary" size="sm" onClick={copy}>
                  Copiar
                </Button>
              </div>
              <div className="flex justify-end">
                <Button variant="primary" size="lg" onClick={close}>
                  Pronto
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-13 text-secondary">
                {conta?.name} ({conta?.email}). As sessões abertas caem quando a senha muda.
              </p>
              {!emailLigado && (
                <p className="rounded border border-subtle px-3 py-2 text-12 text-tertiary">
                  O envio de e-mail não está configurado. Gere uma senha provisória.
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => reset("provisoria")}
                  loading={enviando === "provisoria"}
                >
                  Gerar senha provisória
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => reset("email")}
                  loading={enviando === "email"}
                  disabled={!emailLigado}
                >
                  Enviar link por e-mail
                </Button>
              </div>
            </div>
          )}
        </div>
      </Dialog.Panel>
    </Dialog>
  );
}
