/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Input, ToggleSwitch } from "@plane/ui";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// services
import { ChatService } from "@/services/chat.service";
// local imports
import { ChatWorkspaceSettingsHeader } from "./header";

const chatService = new ChatService();

function ChatSettingsPage() {
  const { workspaceSlug } = useParams();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();
  const { t } = useTranslation();

  const [enabled, setEnabled] = useState(false);
  const [apiUrl, setApiUrl] = useState("");
  const [wsUrl, setWsUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  const { data, isLoading, mutate } = useSWR(
    workspaceSlug && isAdmin ? `CHAT_CONFIG_${workspaceSlug}` : null,
    workspaceSlug && isAdmin ? () => chatService.getConfig(workspaceSlug.toString()) : null
  );

  useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setApiUrl(data.api_url);
    setWsUrl(data.ws_url);
  }, [data]);

  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - ${t("workspace_settings.settings.chat.title")}` : undefined;

  if (workspaceUserInfo && !isAdmin) return <NotAuthorizedView section="settings" className="h-auto" />;

  const handleSave = async () => {
    if (!workspaceSlug) return;
    if (enabled && (!apiUrl.trim() || !wsUrl.trim())) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "Informe a URL da API e do WebSocket do plugin." });
      return;
    }
    setSaving(true);
    try {
      await chatService.updateConfig(workspaceSlug.toString(), { enabled, api_url: apiUrl.trim(), ws_url: wsUrl.trim() });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Salvo", message: "Configuração do chat atualizada." });
      await mutate();
    } catch (err: unknown) {
      const error = err as { detail?: string };
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: error?.detail || "Não foi possível salvar." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsContentWrapper header={<ChatWorkspaceSettingsHeader />} hugging>
      <PageHead title={pageTitle} />
      <SettingsHeading
        title={t("workspace_settings.settings.chat.title")}
        description="Plugin de atendimento (chat). Habilite e informe a URL da API e do WebSocket do backend do chat. O plugin vem instalado, porém desabilitado por padrão."
      />
      {isLoading ? (
        <div className="py-6 text-sm text-secondary">Carregando…</div>
      ) : (
        <div className="flex max-w-2xl flex-col gap-5 py-2">
          <div className="flex items-center justify-between rounded-md border border-subtle p-3">
            <div>
              <p className="text-sm font-medium text-primary">Chat habilitado</p>
              <p className="text-13 text-secondary">Quando ligado, a página de Atendimento conecta ao backend do chat.</p>
            </div>
            <ToggleSwitch value={enabled} onChange={setEnabled} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">URL da API do plugin</label>
            <Input type="text" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="http://localhost/chat-api" className="w-full" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-secondary">URL do WebSocket do plugin</label>
            <Input type="text" value={wsUrl} onChange={(e) => setWsUrl(e.target.value)} placeholder="ws://localhost/chat-ws" className="w-full" />
          </div>
          <div>
            <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      )}
    </SettingsContentWrapper>
  );
}

export default observer(ChatSettingsPage);
