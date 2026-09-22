/**
 * Nova visita técnica. Aberta pela lista de visitas ou pela ação "Criar visita"
 * no detalhe do chamado; no segundo caso a visita nasce vinculada ao chamado e a
 * API completa entidade, cidade e sistema a partir dele.
 */
import { useState } from "react";
import { observer } from "mobx-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EntityDropdown } from "@/components/dropdowns/entity";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { SeletorDeContatos } from "@/components/entity-contacts";
import { useUser } from "@/hooks/store/user";
import { technicalVisitService } from "@/services/technical-visit.service";
import type { TTechnicalVisit, TVisitApiError } from "./types";
import { INPUT_CLASS, VisitFieldError, fromDateTimeLocal } from "./visit-display";
import { mapVisitErrors } from "./visit-rules";

export type TVisitSourceIssue = { id: string; code: string; name: string; entityId?: string | null };

type Props = {
  workspaceSlug: string;
  onClose: () => void;
  onCreated: (visit: TTechnicalVisit) => void;
  /** Chamado de origem, quando a visita é aberta pelo detalhe do chamado. */
  sourceIssue?: TVisitSourceIssue;
};

type TForm = {
  entity_id: string | null;
  city: string;
  scheduled_date: string;
  technician_id: string | null;
  technician2_id: string | null;
  contact_ids: string[];
};

const buildPayload = (form: TForm, sourceIssue?: TVisitSourceIssue) => ({
  ...form,
  // Cidade vazia deixa a API usar a da entidade.
  city: form.city.trim() || undefined,
  scheduled_date: fromDateTimeLocal(form.scheduled_date),
  issue_ids: sourceIssue ? [sourceIssue.id] : [],
});

export const CreateVisitModal = observer(function CreateVisitModal(props: Props) {
  const { workspaceSlug, onClose, onCreated, sourceIssue } = props;
  const { data: currentUser } = useUser();
  const [form, setForm] = useState<TForm>({
    entity_id: sourceIssue?.entityId ?? null,
    city: "",
    scheduled_date: "",
    technician_id: currentUser?.id ?? null,
    technician2_id: null,
    contact_ids: [],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const update = <K extends keyof TForm>(key: K, value: TForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const onEntityChange = (entityId: string | null, entity?: { city?: string | null }) =>
    setForm((f) => ({ ...f, entity_id: entityId, city: entity?.city ?? "", contact_ids: [] }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const visit = await technicalVisitService.create(workspaceSlug, buildPayload(form, sourceIssue));
      setToast({ type: TOAST_TYPE.SUCCESS, title: `Visita ${visit.visit_number ?? ""} criada.` });
      onCreated(visit);
      onClose();
    } catch (erro) {
      setErrors(mapVisitErrors(erro));
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Não foi possível criar a visita.",
        message: (erro as TVisitApiError)?.detail,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="shadow-xl w-full max-w-md rounded-lg bg-surface-1 p-6">
        <h2 className="text-base mb-1 font-semibold">Nova visita técnica</h2>
        {sourceIssue && (
          <p className="mb-3 text-12 text-secondary">
            Vinculada ao chamado {sourceIssue.code}: {sourceIssue.name}
          </p>
        )}
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-12 text-secondary">Entidade</label>
            <EntityDropdown
              workspaceSlug={workspaceSlug}
              value={form.entity_id}
              onChange={onEntityChange}
              placeholder={sourceIssue ? "Entidade do chamado" : "Selecionar entidade"}
              className="w-full"
            />
            <VisitFieldError message={errors.entity_id} />
          </div>
          <div>
            <label className="mb-1 block text-12 text-secondary">Cidade</label>
            <input
              className={INPUT_CLASS}
              value={form.city}
              onChange={(e) => update("city", e.target.value)}
              placeholder="Vem da entidade"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-12 text-secondary">Técnico</label>
              <MemberDropdown
                value={form.technician_id}
                onChange={(id) => update("technician_id", id)}
                multiple={false}
                buttonVariant="border-with-text"
                placeholder="Técnico"
                className="w-full"
                buttonClassName="w-full"
              />
              <VisitFieldError message={errors.technician_id} />
            </div>
            <div>
              <label className="mb-1 block text-12 text-secondary">2º técnico</label>
              <MemberDropdown
                value={form.technician2_id}
                onChange={(id) => update("technician2_id", id)}
                multiple={false}
                buttonVariant="border-with-text"
                placeholder="Nenhum"
                className="w-full"
                buttonClassName="w-full"
              />
              <VisitFieldError message={errors.technician2_id} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-12 text-secondary">Data agendada</label>
            <input
              type="datetime-local"
              className={INPUT_CLASS}
              value={form.scheduled_date}
              onChange={(e) => update("scheduled_date", e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-12 text-secondary">Responsáveis</label>
            <SeletorDeContatos
              workspaceSlug={workspaceSlug}
              entityId={form.entity_id}
              value={form.contact_ids}
              onChange={(contactIds) => update("contact_ids", contactIds)}
            />
          </div>
          <VisitFieldError message={errors.issue_ids} />
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
              {saving ? "Salvando..." : "Criar visita"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});
