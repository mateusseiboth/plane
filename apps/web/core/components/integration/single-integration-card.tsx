/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR, { mutate } from "swr";
import { CheckCircle } from "lucide-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { IAppIntegration, IWorkspaceIntegration } from "@plane/types";
// ui
import { Loader } from "@plane/ui";
// assets
import GithubLogo from "@/app/assets/services/github.png?url";
import SlackLogo from "@/app/assets/services/slack.png?url";
// constants
import { WORKSPACE_INTEGRATIONS } from "@/constants/fetch-keys";
// hooks
import { useInstance } from "@/hooks/store/use-instance";
import { useUserPermissions } from "@/hooks/store/user";
import useIntegrationPopup from "@/hooks/use-integration-popup";
import { usePlatformOS } from "@/hooks/use-platform-os";
// services
import { IntegrationService } from "@/services/integrations";

type Props = {
  integration: IAppIntegration;
};

const integrationDetails: { [key: string]: any } = {
  github: {
    logo: GithubLogo,
    installed: "Ative o GitHub em projetos individuais para sincronizar com repositórios específicos.",
    notInstalled: "Conecte o GitHub ao seu espaço de trabalho do Avião para sincronizar os chamados do sistema.",
  },
  slack: {
    logo: SlackLogo,
    installed: "Ative o Slack em projetos individuais para sincronizar com canais específicos.",
    notInstalled: "Conecte o Slack ao seu espaço de trabalho do Avião para sincronizar os chamados do sistema.",
  },
};

// services
const integrationService = new IntegrationService();

export const SingleIntegrationCard = observer(function SingleIntegrationCard({ integration }: Props) {
  // states
  const [deletingIntegration, setDeletingIntegration] = useState(false);
  // router
  const { workspaceSlug } = useParams();
  // store hooks
  const { config } = useInstance();
  const { allowPermissions } = useUserPermissions();

  const isUserAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  const { isMobile } = usePlatformOS();
  const { startAuth, isConnecting: isInstalling } = useIntegrationPopup({
    provider: integration.provider,
    github_app_name: config?.github_app_name || "",
    slack_client_id: config?.slack_client_id || "",
  });

  const { data: workspaceIntegrations } = useSWR(workspaceSlug ? WORKSPACE_INTEGRATIONS(workspaceSlug) : null, () =>
    workspaceSlug ? integrationService.getWorkspaceIntegrationsList(workspaceSlug) : null
  );

  const handleRemoveIntegration = async () => {
    if (!workspaceSlug || !integration || !workspaceIntegrations) return;

    const workspaceIntegrationId = workspaceIntegrations?.find((i) => i.integration === integration.id)?.id;

    setDeletingIntegration(true);

    await integrationService
      .deleteWorkspaceIntegration(workspaceSlug, workspaceIntegrationId ?? "")
      .then(() => {
        mutate<IWorkspaceIntegration[]>(
          WORKSPACE_INTEGRATIONS(workspaceSlug),
          (prevData) => prevData?.filter((i) => i.id !== workspaceIntegrationId),
          false
        );
        setDeletingIntegration(false);

        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Excluído com sucesso!",
          message: `Integração ${integration.title} removida com sucesso.`,
        });
      })
      .catch(() => {
        setDeletingIntegration(false);

        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Erro!",
          message: `Não foi possível remover a integração ${integration.title}. Tente novamente.`,
        });
      });
  };

  const isInstalled = workspaceIntegrations?.find((i: any) => i.integration_detail.id === integration.id);

  return (
    <div className="flex items-center justify-between gap-2 border-b border-subtle bg-surface-1 px-4 py-6">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 flex-shrink-0">
          <img
            src={integrationDetails[integration.provider].logo}
            className="h-full w-full object-cover"
            alt={`${integration.title} Logo`}
          />
        </div>
        <div>
          <h3 className="flex items-center gap-2 text-body-xs-medium">
            {integration.title}
            {workspaceIntegrations
              ? isInstalled && <CheckCircle className="h-3.5 w-3.5 fill-transparent text-success-primary" />
              : null}
          </h3>
          <p className="text-body-xs-regular text-secondary">
            {workspaceIntegrations
              ? isInstalled
                ? integrationDetails[integration.provider].installed
                : integrationDetails[integration.provider].notInstalled
              : "Carregando..."}
          </p>
        </div>
      </div>

      {workspaceIntegrations ? (
        isInstalled ? (
          <Tooltip
            isMobile={isMobile}
            disabled={isUserAdmin}
            tooltipContent={!isUserAdmin ? "Você não tem permissão para executar esta ação" : null}
          >
            <Button
              className={`${!isUserAdmin ? "hover:cursor-not-allowed" : ""}`}
              variant="error-fill"
              onClick={() => {
                if (!isUserAdmin) return;
                handleRemoveIntegration();
              }}
              disabled={!isUserAdmin}
              loading={deletingIntegration}
            >
              {deletingIntegration ? "Uninstalling..." : "Uninstall"}
            </Button>
          </Tooltip>
        ) : (
          <Tooltip
            isMobile={isMobile}
            disabled={isUserAdmin}
            tooltipContent={!isUserAdmin ? "Você não tem permissão para executar esta ação" : null}
          >
            <Button
              className={`${!isUserAdmin ? "hover:cursor-not-allowed" : ""}`}
              variant="primary"
              onClick={() => {
                if (!isUserAdmin) return;
                startAuth();
              }}
              loading={isInstalling}
            >
              {isInstalling ? "Installing..." : "Install"}
            </Button>
          </Tooltip>
        )
      ) : (
        <Loader>
          <Loader.Item height="32px" width="64px" />
        </Loader>
      )}
    </div>
  );
});
