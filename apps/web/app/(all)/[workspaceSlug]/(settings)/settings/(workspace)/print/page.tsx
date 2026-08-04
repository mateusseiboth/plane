/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Trash2, Upload } from "lucide-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel, MAX_FILE_SIZE } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EFileAssetType, type TWorkspacePrintSettings } from "@plane/types";
import { Input, ToggleSwitch } from "@plane/ui";
import { getFileURL } from "@plane/utils";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { PRINT_SETTINGS_DEFAULTS, usePrintSettings } from "@/components/print";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// services
import { FileService } from "@/services/file.service";
import { WorkspaceService } from "@/services/workspace.service";
// local imports
import { PrintWorkspaceSettingsHeader } from "./header";

const workspaceService = new WorkspaceService();
const fileService = new FileService();

function PrintSettingsPage() {
  const { workspaceSlug } = useParams();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();
  const { t } = useTranslation();
  const { printSettings, isLoading, mutate } = usePrintSettings(workspaceSlug?.toString());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<TWorkspacePrintSettings>(PRINT_SETTINGS_DEFAULTS);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  useEffect(() => setForm(printSettings), [printSettings]);

  const pageTitle = currentWorkspace?.name
    ? `${currentWorkspace.name} - ${t("workspace_settings.settings.print.title")}`
    : undefined;

  if (workspaceUserInfo && !isAdmin) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  const set = <K extends keyof TWorkspacePrintSettings>(key: K, value: TWorkspacePrintSettings[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const persist = async (payload: Partial<TWorkspacePrintSettings>) => {
    if (!workspaceSlug) return;
    const updated = await workspaceService.updatePrintSettings(workspaceSlug.toString(), payload);
    await mutate(updated, { revalidate: false });
    return updated;
  };

  const handleLogoSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !workspaceSlug || !currentWorkspace) return;
    if (file.size > MAX_FILE_SIZE) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "A imagem excede o tamanho máximo permitido." });
      return;
    }

    setIsUploading(true);
    try {
      const { asset_id } = await fileService.uploadWorkspaceAsset(
        workspaceSlug.toString(),
        { entity_identifier: currentWorkspace.id, entity_type: EFileAssetType.WORKSPACE_LOGO },
        file
      );
      await persist({ logo_asset: asset_id });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Salvo", message: "Logo de impressão atualizado." });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "Não foi possível enviar o logo." });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    try {
      await persist({ logo_asset: null, logo_url: null });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Salvo", message: "Logo de impressão removido." });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "Não foi possível remover o logo." });
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await persist({
        header_text: form.header_text,
        footer_text: form.footer_text,
        show_generated_at: form.show_generated_at,
      });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Salvo", message: "Configurações de impressão atualizadas." });
    } catch (err: unknown) {
      const error = err as { detail?: string };
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: error?.detail || "Não foi possível salvar." });
    } finally {
      setIsSaving(false);
    }
  };

  const logoUrl = printSettings.logo_url ? getFileURL(printSettings.logo_url) : undefined;
  const headerPreview = form.header_text || currentWorkspace?.name || "";

  return (
    <SettingsContentWrapper header={<PrintWorkspaceSettingsHeader />} hugging>
      <PageHead title={pageTitle} />
      <SettingsHeading
        title={t("workspace_settings.settings.print.title")}
        description="Defina o logo e os textos que aparecem no cabeçalho e no rodapé de tudo que for impresso a partir do sistema (chamados, listagens, solicitações, ciclos, módulos, visitas técnicas e relatórios)."
      />

      {isLoading ? (
        <div className="py-6 text-sm text-secondary">Carregando…</div>
      ) : (
        <div className="flex max-w-2xl flex-col gap-6 py-2">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-secondary">Logo de impressão</label>
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-40 items-center justify-center rounded-md border border-subtle bg-surface-2 p-2">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo de impressão" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-13 text-tertiary">Sem logo</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={handleLogoSelected}
                />
                <Button
                  variant="secondary"
                  size="lg"
                  loading={isUploading}
                  prependIcon={<Upload />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {logoUrl ? "Trocar logo" : "Enviar logo"}
                </Button>
                {logoUrl && (
                  <Button variant="error-outline" size="lg" prependIcon={<Trash2 />} onClick={handleRemoveLogo}>
                    Remover
                  </Button>
                )}
              </div>
            </div>
            <p className="text-13 text-secondary">
              Recomendado: PNG ou SVG com fundo transparente, altura mínima de 96px.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">Texto do cabeçalho</label>
            <Input
              type="text"
              value={form.header_text ?? ""}
              onChange={(e) => set("header_text", e.target.value)}
              placeholder={currentWorkspace?.name ?? "Nome da empresa"}
              className="w-full"
            />
            <p className="mt-1 text-13 text-secondary">
              Aparece ao lado do logo. Deixe vazio para usar o nome do espaço de trabalho.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">Texto do rodapé</label>
            <Input
              type="text"
              value={form.footer_text ?? ""}
              onChange={(e) => set("footer_text", e.target.value)}
              placeholder="Ex.: Documento gerado automaticamente — uso interno"
              className="w-full"
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-subtle p-3">
            <div>
              <p className="text-sm font-medium text-primary">Mostrar data e hora de geração</p>
              <p className="text-13 text-secondary">Imprime no cabeçalho o momento em que o documento foi gerado.</p>
            </div>
            <ToggleSwitch
              value={form.show_generated_at}
              onChange={(value: boolean) => set("show_generated_at", value)}
            />
          </div>

          <div className="rounded-md border border-subtle bg-surface-2 p-4">
            <p className="mb-3 text-13 font-medium text-secondary">Prévia do cabeçalho</p>
            <div className="rounded-sm bg-white p-4 text-neutral-900">
              <div className="flex items-start justify-between gap-4 border-b border-neutral-300 pb-3">
                <div className="flex items-start gap-3">
                  {logoUrl && <img src={logoUrl} alt="" className="h-12 max-w-[180px] object-contain" />}
                  <div className="flex flex-col gap-0.5">
                    {headerPreview && <p className="text-sm font-semibold">{headerPreview}</p>}
                    <p className="text-lg font-bold leading-tight">Chamado ABC-123</p>
                    <p className="text-xs">Exemplo de documento impresso</p>
                  </div>
                </div>
                {form.show_generated_at && (
                  <p className="shrink-0 text-right text-[10px]">Gerado em {new Date().toLocaleString("pt-BR")}</p>
                )}
              </div>
              {form.footer_text && (
                <p className="mt-6 border-t border-neutral-300 pt-2 text-[10px]">{form.footer_text}</p>
              )}
            </div>
          </div>

          <div>
            <Button variant="primary" size="lg" onClick={handleSave} loading={isSaving}>
              {isSaving ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      )}
    </SettingsContentWrapper>
  );
}

export default observer(PrintSettingsPage);
