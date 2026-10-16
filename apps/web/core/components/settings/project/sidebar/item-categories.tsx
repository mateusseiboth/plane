/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { usePathname } from "next/navigation";
import { useParams } from "react-router";
// plane imports
import {
  GROUPED_PROJECT_SETTINGS,
  PROJECT_SETTINGS_CATEGORIES,
  PROJECT_SETTINGS_CATEGORY_LABELS,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// components
import { SettingsSidebarItem } from "@/components/settings/sidebar/item";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";
import { isRequiredActionAllowed } from "@/lib/permissoes/acao-efetiva";
// local imports
import { PROJECT_SETTINGS_ICONS } from "./item-icon";

type Props = {
  projectId: string;
};

export const ProjectSettingsSidebarItemCategories = observer(function ProjectSettingsSidebarItemCategories(
  props: Props
) {
  const { projectId } = props;
  // params
  const { workspaceSlug } = useParams();
  const pathname = usePathname();
  // store hooks
  const { getProjectRoleByWorkspaceSlugAndProjectId } = useUserPermissions();
  const { canInProject } = useMyWorkspaceActions(workspaceSlug?.toString());
  // derived values
  // Participar do sistema é o vínculo; o item ainda pode exigir uma ação da matriz.
  const isProjectMember =
    getProjectRoleByWorkspaceSlugAndProjectId(workspaceSlug?.toString() ?? "", projectId) !== undefined;
  // translation
  const { t } = useTranslation();

  return (
    <div className="mt-3 flex flex-col divide-y divide-subtle px-3">
      {PROJECT_SETTINGS_CATEGORIES.map((category) => {
        const categoryItems = GROUPED_PROJECT_SETTINGS[category];
        const accessibleItems = categoryItems.filter(
          (item) => isProjectMember && isRequiredActionAllowed(item.action, (action) => canInProject(action, projectId))
        );

        if (accessibleItems.length === 0) return null;

        return (
          <div key={category} className="shrink-0 py-3 first:pt-0 last:pb-0">
            <div className="p-2 text-caption-md-medium text-tertiary capitalize">
              {t(PROJECT_SETTINGS_CATEGORY_LABELS[category])}
            </div>
            <div className="flex flex-col">
              {accessibleItems.map((item) => {
                const isItemActive =
                  item.href === ""
                    ? pathname === `/${workspaceSlug}/settings/projects/${projectId}${item.href}/`
                    : new RegExp(`^/${workspaceSlug}/settings/projects/${projectId}${item.href}/`).test(pathname);

                return (
                  <SettingsSidebarItem
                    key={item.key}
                    as="link"
                    href={`/${workspaceSlug}/settings/projects/${projectId}${item.href}/`}
                    isActive={isItemActive}
                    icon={PROJECT_SETTINGS_ICONS[item.key]}
                    label={t(item.i18n_label)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
});
