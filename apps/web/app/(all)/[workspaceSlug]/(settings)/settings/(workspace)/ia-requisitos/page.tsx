/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Configuração da IA de levantamento de requisitos — por espaço de trabalho.
 *
 * A tela só monta o cenário: confere que quem chegou é administrador, lê a
 * configuração e entrega ao formulário. Quem conhece as regras entre as opções
 * é o formulário; quem conhece o formato dos dados é o service.
 */

"use client";

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
import { AvisoServicoDesligado } from "@/components/workspace/settings/ia-requisitos/aviso-servico-desligado";
import { FormularioIaRequisitos } from "@/components/workspace/settings/ia-requisitos/formulario";
// hooks
import { useConfiguracaoDeIa } from "@/hooks/use-configuracao-de-ia";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { IaRequisitosWorkspaceSettingsHeader } from "./header";

function IaRequisitosSettingsPage() {
  const { workspaceSlug } = useParams();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();
  const { t } = useTranslation();

  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  // O mesmo hook que o texto fantasma e a análise usam: uma leitura só, e o
  // que for salvo aqui já chega às telas de chamado sem recarregar a página.
  const { data, configuracao, iaDisponivel, isLoading, error, salvar } = useConfiguracaoDeIa(
    workspaceSlug?.toString()
  );

  const titulo = t("workspace_settings.settings.ia_requisitos.title");
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - ${titulo}` : undefined;

  if (workspaceUserInfo && !isAdmin) return <NotAuthorizedView section="settings" className="h-auto" />;

  return (
    <SettingsContentWrapper header={<IaRequisitosWorkspaceSettingsHeader />} hugging>
      <PageHead title={pageTitle} />
      <SettingsHeading
        title={titulo}
        description="A IA lê o chamado sendo escrito e ajuda quem abre a chegar num pedido completo: sugere a continuação do texto enquanto se digita e, ao salvar, confere o chamado contra o checklist de levantamento de requisitos. Estas opções valem para todo o espaço de trabalho."
      />

      <div className="flex max-w-2xl flex-col gap-5">
        {iaDisponivel === false && <AvisoServicoDesligado />}

        {isLoading && <div className="py-6 text-sm text-secondary">Carregando…</div>}

        {!isLoading && !data && (
          <div className="py-6 text-sm text-secondary">
            Não foi possível carregar a configuração da IA de requisitos.
            {(error as { detail?: string } | undefined)?.detail ? ` ${(error as { detail: string }).detail}` : ""}
          </div>
        )}

        {!isLoading && data && <FormularioIaRequisitos configuracao={configuracao} onSalvar={salvar} />}
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(IaRequisitosSettingsPage);
