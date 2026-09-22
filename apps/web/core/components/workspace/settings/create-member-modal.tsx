/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { Controller, useForm } from "react-hook-form";
import { X } from "lucide-react";
// plane imports
import { ROLE } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { Dialog, EDialogWidth } from "@plane/propel/dialog";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Input } from "@plane/ui";
// components
import { SelectPesquisavel } from "@/components/common/select-pesquisavel";
import { SeletorDeSistemas } from "@/components/entity-contacts/seletor-de-sistemas";
// helpers
import { applyApiFieldErrors } from "@/helpers/api-field-errors.helper";
// hooks
import { useMember } from "@/hooks/store/use-member";
// services
import memberAccountService, { type TNewMemberAccount } from "@/services/member-account.service";

type Props = {
  open: boolean;
  onClose: () => void;
  workspaceSlug: string;
};

const EMPTY_FORM: TNewMemberAccount = {
  email: "",
  username: "",
  first_name: "",
  last_name: "",
  password: "",
  role: 15,
  project_ids: [],
};

const ROLE_OPTIONS = Object.entries(ROLE).map(([level, label]) => ({ value: Number(level), label }));

type TTextField = Exclude<keyof TNewMemberAccount, "role" | "project_ids">;

const TEXT_FIELDS: { name: TTextField; label: string; type: "text" | "email" | "password"; placeholder?: string }[] = [
  { name: "first_name", label: "Nome *", type: "text" },
  { name: "last_name", label: "Sobrenome", type: "text" },
  { name: "email", label: "E-mail *", type: "email", placeholder: "nome@empresa.com.br" },
  { name: "username", label: "Usuário", type: "text", placeholder: "Se ficar em branco, sai do e-mail" },
  { name: "password", label: "Senha *", type: "password", placeholder: "Pelo menos 8 caracteres" },
];

/** Cria a conta direto, sem convite, já com papel e sistemas. */
export const CreateMemberModal = observer(function CreateMemberModal({ open, onClose, workspaceSlug }: Props) {
  const {
    workspace: { fetchWorkspaceMembers },
  } = useMember();
  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TNewMemberAccount>({ defaultValues: EMPTY_FORM });

  useEffect(() => {
    if (open) reset(EMPTY_FORM);
  }, [open, reset]);

  const onSubmit = async (form: TNewMemberAccount) => {
    try {
      const created = await memberAccountService.create(workspaceSlug, form);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Usuário criado",
        message: `${created.display_name} já pode entrar.`,
      });
      void fetchWorkspaceMembers(workspaceSlug);
      onClose();
    } catch (error) {
      const message = applyApiFieldErrors(
        error,
        (path, text) => setError(path as keyof TNewMemberAccount, { message: text }),
        "Não foi possível criar o usuário."
      );
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <Dialog.Panel width={EDialogWidth.XL}>
        <form onSubmit={handleSubmit(onSubmit)} className="max-h-[85vh] space-y-4 overflow-y-auto p-6">
          <div className="flex items-center justify-between">
            <Dialog.Title>Criar usuário</Dialog.Title>
            <button type="button" onClick={onClose} className="rounded p-1 text-secondary hover:bg-surface-2">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {TEXT_FIELDS.map((field) => (
              <div key={field.name}>
                <label htmlFor={`novo-${field.name}`} className="mb-1 block text-12 font-medium text-secondary">
                  {field.label}
                </label>
                <Controller
                  control={control}
                  name={field.name}
                  render={({ field: { value, onChange, ref } }) => (
                    <Input
                      id={`novo-${field.name}`}
                      type={field.type}
                      value={value}
                      onChange={onChange}
                      ref={ref}
                      hasError={Boolean(errors[field.name])}
                      placeholder={field.placeholder}
                      className="w-full"
                    />
                  )}
                />
                {errors[field.name] && (
                  <span className="text-11 text-danger-primary">{errors[field.name]?.message}</span>
                )}
              </div>
            ))}
            <div>
              <span className="mb-1 block text-12 font-medium text-secondary">Papel *</span>
              <Controller
                control={control}
                name="role"
                render={({ field: { value, onChange } }) => (
                  <SelectPesquisavel value={value} onChange={onChange} opcoes={ROLE_OPTIONS} />
                )}
              />
              {errors.role && <span className="text-11 text-danger-primary">{errors.role.message}</span>}
            </div>
          </div>

          <div>
            <span className="mb-1 block text-12 font-medium text-secondary">Sistemas</span>
            <Controller
              control={control}
              name="project_ids"
              render={({ field: { value, onChange } }) => (
                <SeletorDeSistemas value={value} onChange={onChange} error={errors.project_ids?.message} />
              )}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="lg" type="button" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" size="lg" type="submit" loading={isSubmitting}>
              Criar usuário
            </Button>
          </div>
        </form>
      </Dialog.Panel>
    </Dialog>
  );
});
