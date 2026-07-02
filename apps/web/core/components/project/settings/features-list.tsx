/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { setPromiseToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { IProject } from "@plane/types";
import { CycleIcon, IntakeIcon, ModuleIcon, PageIcon, ViewsIcon } from "@plane/propel/icons";
// components
import { SettingsBoxedControlItem } from "@/components/settings/boxed-control-item";
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useProject } from "@/hooks/store/use-project";
// plane web imports
import { UpgradeBadge } from "@/plane-web/components/workspace/upgrade-badge";
// local imports
import { ProjectFeatureToggle } from "./helper";

type Props = {
  workspaceSlug: string;
  projectId: string;
  isAdmin: boolean;
};

const PROJECT_FEATURES_LIST = {
  cycles: {
    key: "cycles",
    property: "cycle_view",
    title: "Ciclos",
    description: "Defina períodos de trabalho como achar melhor por projeto e altere a frequência de um período para o outro.",
    icon: <CycleIcon className="h-5 w-5 flex-shrink-0 rotate-180 text-tertiary" />,
    isPro: false,
    isEnabled: true,
  },
  modules: {
    key: "modules",
    property: "module_view",
    title: "Módulos",
    description: "Agrupe o trabalho em configurações semelhantes a subprojetos, com seus próprios responsáveis e encarregados.",
    icon: <ModuleIcon width={20} height={20} className="flex-shrink-0 text-tertiary" />,
    isPro: false,
    isEnabled: true,
  },
  views: {
    key: "views",
    property: "issue_views_view",
    title: "Visualizações",
    description: "Salve ordenações, filtros e opções de exibição para depois ou compartilhe-os.",
    icon: <ViewsIcon className="h-5 w-5 flex-shrink-0 text-tertiary" />,
    isPro: false,
    isEnabled: true,
  },
  pages: {
    key: "pages",
    property: "page_view",
    title: "Páginas",
    description: "Escreva qualquer coisa como você escreve qualquer coisa.",
    icon: <PageIcon className="h-5 w-5 flex-shrink-0 text-tertiary" />,
    isPro: false,
    isEnabled: true,
  },
  inbox: {
    key: "intake",
    property: "inbox_view",
    title: "Admissão",
    description: "Considere e discuta os itens de trabalho antes de adicioná-los ao seu projeto.",
    icon: <IntakeIcon className="h-5 w-5 flex-shrink-0 text-tertiary" />,
    isPro: false,
    isEnabled: true,
  },
};

export const ProjectFeaturesList = observer(function ProjectFeaturesList(props: Props) {
  const { workspaceSlug, projectId, isAdmin } = props;
  // store hooks
  const { t } = useTranslation();
  const { getProjectById, updateProject } = useProject();
  // derived values
  const currentProjectDetails = getProjectById(projectId);

  const handleSubmit = (_featureKey: string, featureProperty: string) => {
    if (!workspaceSlug || !projectId || !currentProjectDetails) return;

    // making the request to update the project feature
    const settingsPayload = {
      [featureProperty]: !currentProjectDetails?.[featureProperty as keyof IProject],
    };
    const updateProjectPromise = updateProject(workspaceSlug, projectId, settingsPayload);

    setPromiseToast(updateProjectPromise, {
      loading: "Atualizando recurso do projeto...",
      success: {
        title: "Sucesso!",
        message: () => "Project feature updated successfully.",
      },
      error: {
        title: "Erro!",
        message: () => "Something went wrong while updating project feature. Please try again.",
      },
    });
    void updateProjectPromise.then(() => {
      return undefined;
    });
  };

  return (
    <>
      <div>
        <SettingsHeading title={t("projects_and_issues")} description={t("projects_and_issues_description")} />
        <div className="mt-6 flex flex-col gap-y-4">
          {Object.entries(PROJECT_FEATURES_LIST).map(([featureItemKey, featureItem]) => (
            <div key={featureItemKey}>
              <SettingsBoxedControlItem
                title={
                  <span className="flex items-center gap-2">
                    {t(featureItem.key)}
                    {featureItem.isPro && (
                      <Tooltip tooltipContent="Recurso Pro" position="top">
                        <UpgradeBadge className="rounded-sm" />
                      </Tooltip>
                    )}
                  </span>
                }
                description={t(`${featureItem.key}_description`)}
                control={
                  <ProjectFeatureToggle
                    workspaceSlug={workspaceSlug}
                    projectId={projectId}
                    featureItem={featureItem}
                    value={Boolean(currentProjectDetails?.[featureItem.property as keyof IProject])}
                    handleSubmit={handleSubmit}
                    disabled={!isAdmin}
                  />
                }
              />
              {/* {currentProjectDetails?.[featureItem.property as keyof IProject] && (
                <div className="pl-14">{featureItem.renderChildren?.(currentProjectDetails, workspaceSlug)}</div>
              )} */}
            </div>
          ))}
        </div>
      </div>
    </>
  );
});
