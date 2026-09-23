/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

/**
 * Configurações > Plugins: o que está instalado, o envio de um pacote novo, o
 * liga/desliga, a grade de permissões por função e a configuração de cada
 * plugin. Exige `plugin.manage`. Ver .claude/plugins.md.
 */
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { EnvioDePlugin } from "@/components/plugins/gestao/envio-de-plugin";
import { ListaDePlugins } from "@/components/plugins/gestao/lista-de-plugins";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { usePluginsInstalados } from "@/hooks/use-plugins-gestao";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";
// local imports
import { PluginsSettingsHeader } from "./header";

function PluginsSettingsPage() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { currentWorkspace } = useWorkspace();
  const { can, isLoading: carregandoAcoes } = useMyWorkspaceActions(slug);
  const podeGerenciar = can("plugin.manage");

  const { plugins, isLoading, refetch } = usePluginsInstalados(slug, podeGerenciar);

  if (!carregandoAcoes && !podeGerenciar) return <NotAuthorizedView section="settings" className="h-auto" />;

  return (
    <SettingsContentWrapper header={<PluginsSettingsHeader />} hugging>
      <PageHead title={currentWorkspace?.name ? `${currentWorkspace.name} - Plugins` : undefined} />
      <SettingsHeading title="Plugins" description="Pacotes que acrescentam páginas e itens de menu ao sistema." />

      <div className="space-y-6 py-3">
        <EnvioDePlugin workspaceSlug={slug} recarregar={() => void refetch()} />

        {isLoading ? (
          <div className="py-6 text-13 text-secondary">Carregando…</div>
        ) : (
          <ListaDePlugins workspaceSlug={slug} plugins={plugins} recarregar={() => void refetch()} />
        )}
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(PluginsSettingsPage);
