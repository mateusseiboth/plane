/**
 * Verificação da Qualidade: mostra o pós registrado e marca como verificado, com
 * comentário opcional. Sem `posatendimento.verify`, ou já verificado, só mostra.
 */
import { useState } from "react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { INPUT_CLASS } from "@/components/technical-visits/visit-display";
import { PosDetalhes, PosSituacaoBadge } from "@/components/pos-atendimento/pos-display";
import type { TPosApiError, TPosAtendimento } from "@/components/pos-atendimento/types";
import { refreshPosAtendimento } from "@/hooks/use-pos-atendimento";
import { posAtendimentoService } from "@/services/pos-atendimento.service";

type Props = {
  workspaceSlug: string;
  pos: TPosAtendimento;
  titulo: string;
  canVerify: boolean;
  onClose: () => void;
};

export function VerificarPosModal({ workspaceSlug, pos, titulo, canVerify, onClose }: Props) {
  const [comentario, setComentario] = useState("");
  const [saving, setSaving] = useState(false);
  const isVerificavel = canVerify && pos.situacao === "to_verify";

  const onVerify = async () => {
    setSaving(true);
    try {
      await posAtendimentoService.verify(workspaceSlug, pos.id, comentario);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Pós-atendimento verificado." });
      void refreshPosAtendimento();
      onClose();
    } catch (erro) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Não foi possível verificar.",
        message: (erro as TPosApiError)?.detail,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="shadow-xl max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-surface-1 p-6">
        <div className="mb-1 flex items-center gap-2">
          <h2 className="text-base font-semibold">Pós-atendimento</h2>
          <PosSituacaoBadge situacao={pos.situacao} label={pos.situacao_label} />
        </div>
        <p className="mb-4 text-12 text-secondary">{titulo}</p>
        <PosDetalhes pos={pos} />
        {isVerificavel && (
          <div className="mt-4">
            <label htmlFor="pos-comentario" className="mb-1 block text-12 font-medium text-secondary">
              Comentário da verificação (opcional)
            </label>
            <textarea
              id="pos-comentario"
              rows={3}
              className={INPUT_CLASS}
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
            />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-13 text-secondary hover:text-primary"
          >
            Fechar
          </button>
          {isVerificavel && (
            <button
              type="button"
              disabled={saving}
              onClick={onVerify}
              className="rounded bg-accent-primary px-4 py-1.5 text-13 font-medium text-white hover:bg-accent-primary/90 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Marcar como verificado"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
