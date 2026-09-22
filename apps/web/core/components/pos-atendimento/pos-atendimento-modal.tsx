/**
 * Formulário do pós-atendimento (o `popFinalPos.php` do SAC): expectativa,
 * classificação, meio de contato, observação e, só na visita, se o problema foi
 * resolvido. Erro da API volta para o campo.
 */
import { useState } from "react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { INPUT_CLASS, VisitFieldError } from "@/components/technical-visits/visit-display";
import { mapVisitErrors } from "@/components/technical-visits/visit-rules";
import {
  CLASSIFICACAO_OPTIONS,
  EXPECTATIVA_OPTIONS,
  POS_FORM_VAZIO,
  PROBLEMA_RESOLVIDO_OPTIONS,
  buildPosPayload,
  getMeioContatoOptions,
} from "@/components/pos-atendimento/helpers";
import { OpcoesRadio } from "@/components/pos-atendimento/pos-display";
import type { TPosApiError, TPosAtendimento, TPosForm, TPosOrigem } from "@/components/pos-atendimento/types";
import { refreshPosAtendimento, usePosPermissions } from "@/hooks/use-pos-atendimento";
import { posAtendimentoService } from "@/services/pos-atendimento.service";

type Props = {
  workspaceSlug: string;
  origem: TPosOrigem;
  alvoId: string;
  /** Ex.: "Chamado SIARH-7: Folha travada". */
  titulo: string;
  onClose: () => void;
  onSaved?: (pos: TPosAtendimento) => void;
};

export function PosAtendimentoModal({ workspaceSlug, origem, alvoId, titulo, onClose, onSaved }: Props) {
  const { canVerify } = usePosPermissions(workspaceSlug);
  const [form, setForm] = useState<TPosForm>(POS_FORM_VAZIO);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const update = (key: keyof TPosForm) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const pos = await posAtendimentoService.record(workspaceSlug, origem, alvoId, buildPosPayload(form, origem));
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Pós-atendimento registrado." });
      void refreshPosAtendimento();
      onSaved?.(pos);
      onClose();
    } catch (erro) {
      setErrors(mapVisitErrors(erro));
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Não foi possível registrar o pós-atendimento.",
        message: (erro as TPosApiError)?.detail,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="shadow-xl max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-surface-1 p-6">
        <h2 className="text-base mb-1 font-semibold">Pós-atendimento</h2>
        <p className="mb-4 text-12 text-secondary">{titulo}</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <OpcoesRadio
            name="expectativa"
            titulo="O atendimento atendeu a expectativa do cliente?"
            options={EXPECTATIVA_OPTIONS}
            value={form.expectativa}
            onChange={update("expectativa")}
            error={errors.expectativa}
          />
          <OpcoesRadio
            name="classificacao"
            titulo="Como o cliente classifica o atendimento?"
            options={CLASSIFICACAO_OPTIONS}
            value={form.classificacao}
            onChange={update("classificacao")}
            error={errors.classificacao}
          />
          {origem === "visit" && (
            <OpcoesRadio
              name="problema_resolvido"
              titulo="O problema foi resolvido?"
              options={PROBLEMA_RESOLVIDO_OPTIONS}
              value={form.problema_resolvido}
              onChange={update("problema_resolvido")}
              error={errors.problema_resolvido}
            />
          )}
          <OpcoesRadio
            name="meio_contato"
            titulo="Meio de contato"
            options={getMeioContatoOptions(canVerify)}
            value={form.meio_contato}
            onChange={update("meio_contato")}
            error={errors.meio_contato}
          />
          <div>
            <label htmlFor="pos-observacao" className="mb-1 block text-12 font-medium text-secondary">
              Observação
            </label>
            <textarea
              id="pos-observacao"
              rows={4}
              className={INPUT_CLASS}
              value={form.observacao}
              onChange={(e) => update("observacao")(e.target.value)}
            />
            <VisitFieldError message={errors.observacao} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-3 py-1.5 text-13 text-secondary hover:text-primary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-accent-primary px-4 py-1.5 text-13 font-medium text-white hover:bg-accent-primary/90 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Registrar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
