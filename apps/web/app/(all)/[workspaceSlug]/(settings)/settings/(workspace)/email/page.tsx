/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Input } from "@plane/ui";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { SelectPesquisavel } from "@/components/common/select-pesquisavel";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
// helpers
import { applyApiFieldErrors } from "@/helpers/api-field-errors.helper";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
import { useEmailConfig } from "@/hooks/use-email-config";
// services
import emailConfigService, { type TEmailConfig, type TSmtpSecurity } from "@/services/email-config.service";
// local imports
import { EmailWorkspaceSettingsHeader } from "./header";

type TEmailForm = {
  host: string;
  port: string;
  username: string;
  password: string;
  from_address: string;
  from_name: string;
  security: TSmtpSecurity;
};

const SECURITY_OPTIONS: { value: TSmtpSecurity; label: string }[] = [
  { value: "starttls", label: "STARTTLS (porta 587)" },
  { value: "ssl", label: "SSL/TLS (porta 465)" },
  { value: "none", label: "Sem criptografia" },
];

// Situação atual, em uma frase para o administrador.
const ORIGIN_LABELS: Record<TEmailConfig["origin"], string> = {
  instance: "O envio usa a configuração desta tela.",
  env: "O envio usa a configuração do servidor. Salve aqui para substituí-la.",
  none: "O envio de e-mail está desligado. Preencha os dados abaixo para ligar.",
};

type TTextFieldConfig = {
  name: Exclude<keyof TEmailForm, "security">;
  label: string;
  type?: "text" | "password" | "email" | "number";
  placeholder?: string;
};

const TEXT_FIELDS: TTextFieldConfig[] = [
  { name: "host", label: "Servidor SMTP", placeholder: "smtp.empresa.com.br" },
  { name: "port", label: "Porta", type: "number", placeholder: "587" },
  { name: "username", label: "Usuário", placeholder: "Usuário da conta de e-mail" },
  { name: "password", label: "Senha", type: "password" },
  { name: "from_address", label: "E-mail do remetente", type: "email", placeholder: "nao-responda@empresa.com.br" },
  { name: "from_name", label: "Nome do remetente", placeholder: "Suporte" },
];

function buildFormValues(config?: TEmailConfig): TEmailForm {
  return {
    host: config?.host ?? "",
    port: String(config?.port ?? 587),
    username: config?.username ?? "",
    password: "",
    from_address: config?.from_address ?? "",
    from_name: config?.from_name ?? "",
    security: config?.security ?? "starttls",
  };
}

function EmailSettingsPage() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();
  const { t } = useTranslation();
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  const { config, isLoading, refetch } = useEmailConfig(slug, isAdmin);
  const [isTesting, setIsTesting] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TEmailForm>({ defaultValues: buildFormValues() });

  useEffect(() => {
    if (config) reset(buildFormValues(config));
  }, [config, reset]);

  if (workspaceUserInfo && !isAdmin) return <NotAuthorizedView section="settings" className="h-auto" />;

  const onSubmit = async (form: TEmailForm) => {
    try {
      await emailConfigService.save(slug, {
        ...form,
        port: Number(form.port),
        // Senha em branco mantém a gravada.
        password: form.password || undefined,
      });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Salvo", message: "Configuração de e-mail atualizada." });
      await refetch();
    } catch (error) {
      const message = applyApiFieldErrors(
        error,
        (path, text) => setError(path as keyof TEmailForm, { message: text }),
        "Não foi possível salvar."
      );
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message });
    }
  };

  const onSendTest = async () => {
    setIsTesting(true);
    try {
      const result = await emailConfigService.sendTest(slug);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Enviado", message: result.detail });
    } catch (error) {
      const message = (error as { detail?: string })?.detail ?? "Não foi possível enviar o e-mail de teste.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message });
    } finally {
      setIsTesting(false);
    }
  };

  const title = t("workspace_settings.settings.email.title");

  return (
    <SettingsContentWrapper header={<EmailWorkspaceSettingsHeader />} hugging>
      <PageHead title={currentWorkspace?.name ? `${currentWorkspace.name} - ${title}` : undefined} />
      <SettingsHeading
        title={title}
        description="Servidor usado para enviar os e-mails do sistema, como o link de nova senha."
      />

      {isLoading ? (
        <div className="text-sm py-6 text-secondary">Carregando…</div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-2xl flex-col gap-4 py-2">
          {config && (
            <p className="rounded-md border border-subtle px-3 py-2 text-13 text-secondary">
              {ORIGIN_LABELS[config.origin]}
            </p>
          )}

          {TEXT_FIELDS.map((field) => (
            <div key={field.name}>
              <label htmlFor={`smtp-${field.name}`} className="text-sm mb-1 block font-medium text-secondary">
                {field.label}
              </label>
              <Controller
                control={control}
                name={field.name}
                render={({ field: { value, onChange, ref } }) => (
                  <Input
                    id={`smtp-${field.name}`}
                    type={field.type ?? "text"}
                    value={value}
                    onChange={onChange}
                    ref={ref}
                    hasError={Boolean(errors[field.name])}
                    placeholder={
                      field.name === "password" && config?.has_password
                        ? "Mantém a senha atual se ficar em branco"
                        : field.placeholder
                    }
                    className="w-full"
                  />
                )}
              />
              {errors[field.name] && <span className="text-11 text-danger-primary">{errors[field.name]?.message}</span>}
            </div>
          ))}

          <div>
            <span className="text-sm mb-1 block font-medium text-secondary">Segurança</span>
            <Controller
              control={control}
              name="security"
              render={({ field: { value, onChange } }) => (
                <SelectPesquisavel value={value} onChange={onChange} opcoes={SECURITY_OPTIONS} />
              )}
            />
          </div>

          <div className="flex gap-2">
            <Button variant="primary" size="sm" type="submit" loading={isSubmitting}>
              {isSubmitting ? "Salvando…" : "Salvar"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={onSendTest}
              loading={isTesting}
              disabled={!config?.is_configured}
            >
              Enviar e-mail de teste
            </Button>
          </div>
        </form>
      )}
    </SettingsContentWrapper>
  );
}

export default observer(EmailSettingsPage);
