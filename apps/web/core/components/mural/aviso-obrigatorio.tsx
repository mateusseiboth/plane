/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Megaphone } from "lucide-react";
import { Button } from "@plane/propel/button";
import { Dialog, EDialogWidth } from "@plane/propel/dialog";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// hooks
import { useMuralActions, useMuralPendentes } from "@/hooks/use-mural";
// local imports
import { getAvisoAtual } from "./helpers";
import { MuralRecadoAutoria, MuralRecadoConteudo } from "./recado-conteudo";

type Props = { workspaceSlug: string | undefined };

/**
 * Recado obrigatório abre sozinho ao entrar no espaço e só sai com a
 * confirmação de leitura. Montado no wrapper do espaço, vale para qualquer tela;
 * recado novo chega pelo SSE e abre na hora.
 */
export function MuralAvisoObrigatorio({ workspaceSlug }: Props) {
  const { data: pendentes } = useMuralPendentes(workspaceSlug);
  const { markRead } = useMuralActions(workspaceSlug);
  // Confirmado aqui some na hora, sem esperar a lista voltar do servidor.
  const [confirmados, setConfirmados] = useState<Set<string>>(() => new Set());
  const [isSalvando, setIsSalvando] = useState(false);

  const aviso = getAvisoAtual(pendentes, confirmados);
  if (!workspaceSlug || !aviso) return null;

  const onConfirm = async () => {
    setIsSalvando(true);
    try {
      await markRead(aviso.id);
      setConfirmados((atual) => new Set(atual).add(aviso.id));
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

  return (
    <Dialog open onOpenChange={() => undefined}>
      <Dialog.Panel width={EDialogWidth.XXL}>
        <div className="max-h-[85vh] space-y-4 overflow-y-auto p-6">
          <div className="space-y-1">
            <p className="flex items-center gap-1.5 text-11 font-semibold text-accent-primary">
              <Megaphone className="h-3.5 w-3.5" /> Recado de leitura obrigatória
            </p>
            <Dialog.Title>{aviso.title}</Dialog.Title>
            <MuralRecadoAutoria recado={aviso} />
          </div>
          <MuralRecadoConteudo workspaceSlug={workspaceSlug} recado={aviso} />
          <div className="flex justify-end border-t border-subtle pt-4">
            <Button variant="primary" size="sm" onClick={onConfirm} loading={isSalvando}>
              Li e estou ciente
            </Button>
          </div>
        </div>
      </Dialog.Panel>
    </Dialog>
  );
}
