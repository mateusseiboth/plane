/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import {useCallback, useMemo} from "react";
// plane imports
import type {TNavigationItem} from "@/components/navigation/tab-navigation-root";
import {CycleIcon, IntakeIcon, ModuleIcon, PageIcon, ViewsIcon, WorkItemsIcon} from "@plane/propel/icons";
import type {IPartialProject} from "@plane/types";

type UseNavigationItemsProps = {
  workspaceSlug: string;
  projectId: string;
  project?: IPartialProject;
};

// Todas as abas do sistema são leitura: quem participa do sistema vê as que
// estão ligadas nos recursos. Criar/editar dentro delas é decidido em cada tela.
export const useNavigationItems = ({workspaceSlug, projectId, project}: UseNavigationItemsProps): TNavigationItem[] => {
  // Base navigation items
  const baseNavigation = useCallback(
    (workspaceSlug: string, projectId: string): TNavigationItem[] => [
      {
        i18n_key: "sidebar.work_items",
        key: "work_items",
        name: "Chamados",
        href: `/${workspaceSlug}/projects/${projectId}/issues`,
        icon: WorkItemsIcon,
        shouldRender: true,
        sortOrder: 1,
      },
      {
        i18n_key: "sidebar.cycles",
        key: "cycles",
        name: "Cycles",
        href: `/${workspaceSlug}/projects/${projectId}/cycles`,
        icon: CycleIcon,
        shouldRender: !!project?.cycle_view,
        sortOrder: 2,
      },
      {
        i18n_key: "sidebar.modules",
        key: "modules",
        name: "Modules",
        href: `/${workspaceSlug}/projects/${projectId}/modules`,
        icon: ModuleIcon,
        shouldRender: !!project?.module_view,
        sortOrder: 3,
      },
      {
        i18n_key: "sidebar.views",
        key: "views",
        name: "Views",
        href: `/${workspaceSlug}/projects/${projectId}/views`,
        icon: ViewsIcon,
        shouldRender: !!project?.issue_views_view,
        sortOrder: 4,
      },
      {
        i18n_key: "sidebar.pages",
        key: "pages",
        name: "Pages",
        href: `/${workspaceSlug}/projects/${projectId}/pages`,
        icon: PageIcon,
        shouldRender: !!project?.page_view,
        sortOrder: 5,
      },
      {
        i18n_key: "sidebar.intake",
        key: "intake",
        name: "Solicitações",
        href: `/${workspaceSlug}/projects/${projectId}/intake`,
        icon: IntakeIcon,
        shouldRender: !!project?.inbox_view,
        sortOrder: 6,
      },
    ],
    [project],
  );

  // Combine, filter, and sort navigation items
  const navigationItems = useMemo(() => {
    const navItems = baseNavigation(workspaceSlug, projectId);

    // Filter by shouldRender
    const filteredItems = navItems.filter((item) => item.shouldRender);

    // Sort by sortOrder
    return filteredItems.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }, [workspaceSlug, projectId, baseNavigation]);

  return navigationItems;
};
