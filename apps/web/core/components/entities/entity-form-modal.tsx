/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { X } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { Dialog, EDialogWidth } from "@plane/propel/dialog";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TEntity } from "@plane/types";
// components
import { SelectPesquisavel } from "@/components/common/select-pesquisavel";
import { ContatosDaEntidade } from "@/components/entity-contacts";
// helpers
import { applyApiFieldErrors } from "@/helpers/api-field-errors.helper";
// hooks
import { useMember } from "@/hooks/store/use-member";
// services
import entityService from "@/services/entity.service";

export const ENTITY_TYPES: { value: number; label: string }[] = [
  { value: 0, label: "Prefeitura" },
  { value: 1, label: "Câmara" },
  { value: 2, label: "Outros" },
  { value: 3, label: "Escola" },
  { value: 4, label: "Autarquia" },
  { value: 5, label: "RPPS" },
  { value: 6, label: "SAAE" },
  { value: 7, label: "Consórcio" },
];

// Campos de texto do formulário, na ordem da API.
const TEXT_FIELDS = [
  "name",
  "cnpj",
  "state_registration",
  "street",
  "address_number",
  "complement",
  "district",
  "zip_code",
  "city",
  "state",
  "email",
  "phone",
  "fax",
  "website",
] as const;

type TTextField = (typeof TEXT_FIELDS)[number];

type TEntityForm = Record<TTextField, string> & {
  entity_type: number | null;
  representative_id: string | null;
  related_entity_id: string | null;
  uses_third_party_cnpj: boolean;
  is_active: boolean;
};

type TFieldErrors = Partial<Record<keyof TEntityForm, string>>;

function buildForm(entity?: TEntity | null): TEntityForm {
  const text = Object.fromEntries(
    TEXT_FIELDS.map((field) => [field, (entity?.[field] as string | null | undefined) ?? ""])
  ) as Record<TTextField, string>;
  return {
    ...text,
    entity_type: entity?.entity_type ?? null,
    representative_id: entity?.representative_id ?? null,
    related_entity_id: entity?.related_entity_id ?? null,
    uses_third_party_cnpj: entity?.uses_third_party_cnpj ?? false,
    is_active: entity?.is_active ?? true,
  };
}

function buildPayload(form: TEntityForm): Partial<TEntity> {
  const text = Object.fromEntries(TEXT_FIELDS.map((field) => [field, form[field].trim() || null]));
  return {
    ...text,
    name: form.name.trim(),
    entity_type: form.entity_type,
    representative_id: form.representative_id,
    related_entity_id: form.related_entity_id,
    uses_third_party_cnpj: form.uses_third_party_cnpj,
    is_active: form.is_active,
  };
}

const INPUT_CLASS =
  "w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-13 text-primary outline-none focus:border-accent-primary";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-12 text-danger-primary">{message}</p>;
}

type TextInputProps = {
  field: TTextField;
  label: string;
  form: TEntityForm;
  errors: TFieldErrors;
  onChange: (field: TTextField, value: string) => void;
  placeholder?: string;
  maxLength?: number;
};

function TextInput({ field, label, form, errors, onChange, placeholder, maxLength }: TextInputProps) {
  return (
    <div>
      <label htmlFor={`entity-${field}`} className="mb-1 block text-12 font-medium text-secondary">
        {label}
      </label>
      <input
        id={`entity-${field}`}
        value={form[field]}
        onChange={(e) => onChange(field, e.target.value)}
        className={INPUT_CLASS}
        placeholder={placeholder}
        maxLength={maxLength}
      />
      <FieldError message={errors[field]} />
    </div>
  );
}

type Props = {
  entity?: TEntity | null;
  entities: TEntity[];
  workspaceSlug: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export const EntityFormModal = observer(function EntityFormModal(props: Props) {
  const { entity, entities, workspaceSlug, open, onClose, onSaved } = props;
  const [form, setForm] = useState<TEntityForm>(buildForm(entity));
  const [errors, setErrors] = useState<TFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const {
    workspace: { workspaceMemberIds, getWorkspaceMemberDetails },
  } = useMember();

  useEffect(() => {
    setForm(buildForm(entity));
    setErrors({});
  }, [entity, open]);

  const memberOptions = useMemo(
    () =>
      (workspaceMemberIds ?? [])
        .map((id) => getWorkspaceMemberDetails(id)?.member)
        .filter((member): member is NonNullable<typeof member> => Boolean(member))
        .map((member) => ({ value: member.id, label: member.display_name || member.email || "" })),
    [workspaceMemberIds, getWorkspaceMemberDetails]
  );

  const relatedOptions = useMemo(
    () =>
      entities
        .filter((e) => e.id !== entity?.id)
        .map((e) => ({ value: e.id, label: e.name, descricao: e.cnpj ?? undefined })),
    [entities, entity?.id]
  );

  const update = <K extends keyof TEntityForm>(field: K, value: TEntityForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = async () => {
    if (!form.name.trim()) {
      setErrors({ name: "Informe o nome." });
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload(form);
      const save = entity
        ? entityService.update(workspaceSlug, entity.id, payload)
        : entityService.create(workspaceSlug, payload);
      await save;
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Salvo",
        message: entity ? "Entidade atualizada." : "Entidade criada.",
      });
      onSaved();
      onClose();
    } catch (error) {
      const fieldErrors: TFieldErrors = {};
      const message = applyApiFieldErrors(
        error,
        (path, text) => {
          fieldErrors[path as keyof TEntityForm] = text;
        },
        "Não foi possível salvar a entidade."
      );
      setErrors(fieldErrors);
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message });
    } finally {
      setSaving(false);
    }
  };

  const textProps = { form, errors, onChange: (field: TTextField, value: string) => update(field, value) };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <Dialog.Panel width={EDialogWidth.XXL}>
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <div className="mb-5 flex items-center justify-between">
            <Dialog.Title>{entity ? "Editar entidade" : "Nova entidade"}</Dialog.Title>
            <button type="button" onClick={onClose} className="rounded p-1 text-secondary hover:bg-surface-2">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <TextInput field="name" label="Nome *" placeholder="Nome da entidade" {...textProps} />
              </div>
              <div>
                <span className="mb-1 block text-12 font-medium text-secondary">Tipo</span>
                <SelectPesquisavel
                  value={form.entity_type ?? ""}
                  onChange={(value) => update("entity_type", value !== "" ? Number(value) : null)}
                  opcoes={ENTITY_TYPES}
                  opcaoVazia={{ value: "", label: "Selecione o tipo" }}
                />
              </div>
            </div>

            <fieldset className="space-y-3 rounded border border-subtle p-3">
              <legend className="px-1 text-12 font-medium text-secondary">Dados cadastrais</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextInput field="cnpj" label="CNPJ" placeholder="00.000.000/0001-00" {...textProps} />
                <TextInput field="state_registration" label="Inscrição estadual" {...textProps} />
              </div>
              <label className="flex items-center gap-2 text-13 text-primary">
                <input
                  type="checkbox"
                  checked={form.uses_third_party_cnpj}
                  onChange={(e) => update("uses_third_party_cnpj", e.target.checked)}
                  className="accent-accent-primary h-4 w-4 rounded"
                />
                Usa o CNPJ da entidade responsável
              </label>
              <div>
                <span className="mb-1 block text-12 font-medium text-secondary">Entidade responsável</span>
                <SelectPesquisavel
                  value={form.related_entity_id}
                  onChange={(value) => update("related_entity_id", value)}
                  opcoes={relatedOptions}
                  opcaoVazia={{ value: null, label: "Nenhuma" }}
                />
                <FieldError message={errors.related_entity_id} />
              </div>
            </fieldset>

            <fieldset className="space-y-3 rounded border border-subtle p-3">
              <legend className="px-1 text-12 font-medium text-secondary">Endereço</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="sm:col-span-3">
                  <TextInput field="street" label="Logradouro" {...textProps} />
                </div>
                <TextInput field="address_number" label="Número" maxLength={20} {...textProps} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextInput field="complement" label="Complemento" {...textProps} />
                <TextInput field="district" label="Bairro" {...textProps} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <TextInput field="zip_code" label="CEP" placeholder="00000-000" maxLength={9} {...textProps} />
                <div className="sm:col-span-2">
                  <TextInput field="city" label="Cidade" {...textProps} />
                </div>
                <TextInput field="state" label="UF" maxLength={2} {...textProps} />
              </div>
            </fieldset>

            <fieldset className="space-y-3 rounded border border-subtle p-3">
              <legend className="px-1 text-12 font-medium text-secondary">Contato</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextInput field="email" label="E-mail" placeholder="contato@entidade.gov.br" {...textProps} />
                <TextInput field="website" label="Site" placeholder="https://" {...textProps} />
                <TextInput field="phone" label="Telefone" placeholder="(67) 3XXX-XXXX" {...textProps} />
                <TextInput field="fax" label="Fax" {...textProps} />
              </div>
              <div>
                <span className="mb-1 block text-12 font-medium text-secondary">Representante comercial</span>
                <SelectPesquisavel
                  value={form.representative_id}
                  onChange={(value) => update("representative_id", value)}
                  opcoes={memberOptions}
                  opcaoVazia={{ value: null, label: "Nenhum" }}
                />
                <FieldError message={errors.representative_id} />
              </div>
            </fieldset>

            <label className="flex items-center gap-2 text-13 text-primary">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => update("is_active", e.target.checked)}
                className="accent-accent-primary h-4 w-4 rounded"
              />
              Ativa
            </label>

            {/* As pessoas dentro do órgão só existem depois que ele existe. */}
            {entity && (
              <ContatosDaEntidade
                workspaceSlug={workspaceSlug}
                entityId={entity.id}
                className="border-t border-subtle pt-4"
              />
            )}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" size="lg" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" size="lg" onClick={submit} loading={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </Dialog.Panel>
    </Dialog>
  );
});
