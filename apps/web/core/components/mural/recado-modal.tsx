/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { Pin, X } from "lucide-react";
import { Button } from "@plane/propel/button";
import { Dialog, EDialogWidth } from "@plane/propel/dialog";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// hooks
import { useMuralActions } from "@/hooks/use-mural";
// services
import type { TMuralRecado } from "@/services/mural.service";
// local imports
import { MuralLeitores } from "./leitores";
import { MuralRecadoAutoria, MuralRecadoConteudo } from "./recado-conteudo";

type Props = {
  workspaceSlug: string;
  recado: TMuralRecado | undefined;
  onClose: () => void;
  onEdit: (recado: TMuralRecado) => void;
};

const isLeituraAutomatica = (r: TMuralRecado) => !r.is_read && !r.is_required;

/**
 * Recado aberto. Abrir grava a leitura; o obrigatório só conta como lido
 * quando a pessoa confirma no botão, que é o que o aviso de entrada cobra.
 */
export function MuralRecadoModal({ workspaceSlug, recado, onClose, onEdit }: Props) {
  const { canPublish, markRead, update } = useMuralActions(workspaceSlug);
  const [isLeitoresVisivel, setIsLeitoresVisivel] = useState(false);
  const [isSalvando, setIsSalvando] = useState(false);

  // `markRead` muda a cada render; pela ref, a leitura é gravada uma vez por recado aberto.
  const markReadRef = useRef(markRead);
  markReadRef.current = markRead;
  const recadoId = recado?.id;
  const isAutomatica = !!recado && isLeituraAutomatica(recado);

  useEffect(() => {
    setIsLeitoresVisivel(false);
    if (!recadoId || !isAutomatica) return;
    markReadRef.current(recadoId).catch(() => undefined);
  }, [recadoId, isAutomatica]);

  if (!recado) return null;

  const onConfirm = async () => {
    setIsSalvando(true);
    try {
      await markRead(recado.id);
      onClose();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Erro",
        message: "Não foi possível confirmar a leitura. Tente de novo.",
      });
    } finally {
      setIsSalvando(false);
    }
  };

  const onToggleAtivo = async () => {
    setIsSalvando(true);
    try {
      await update(recado.id, { is_active: !recado.is_active });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: recado.is_active ? "Recado inativado" : "Recado reativado",
        message: recado.title,
      });
      onClose();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "Não foi possível salvar. Tente de novo." });
    } finally {
      setIsSalvando(false);
    }
  };

  const isPendente = recado.is_required && !recado.is_read;

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onClose()}>
      <Dialog.Panel width={EDialogWidth.XXL}>
        <div className="max-h-[85vh] space-y-4 overflow-y-auto p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <Dialog.Title>
                <span className="flex items-center gap-2">
                  {recado.is_pinned && <Pin className="h-4 w-4 shrink-0 text-accent-primary" />}
                  {recado.title}
                </span>
              </Dialog.Title>
              <MuralRecadoAutoria recado={recado} />
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="rounded p-1 text-secondary transition-colors hover:bg-surface-2"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <MuralRecadoConteudo workspaceSlug={workspaceSlug} recado={recado} />

          {canPublish && isLeitoresVisivel && <MuralLeitores workspaceSlug={workspaceSlug} recadoId={recado.id} />}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-subtle pt-4">
            {canPublish && (
              <>
                <Button variant="secondary" size="sm" onClick={() => setIsLeitoresVisivel((v) => !v)}>
                  {isLeitoresVisivel ? "Ocultar leituras" : "Quem leu"}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => onEdit(recado)}>
                  Editar
                </Button>
                <Button variant="secondary" size="sm" onClick={onToggleAtivo} disabled={isSalvando}>
                  {recado.is_active ? "Inativar" : "Reativar"}
                </Button>
              </>
            )}
            {isPendente && (
              <Button variant="primary" size="sm" onClick={onConfirm} loading={isSalvando}>
                Confirmar leitura
              </Button>
            )}
          </div>
        </div>
      </Dialog.Panel>
    </Dialog>
  );
}
