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
  GROUPED_WORKSPACE_SETTINGS,
  WORKSPACE_SETTINGS_CATEGORIES,
  WORKSPACE_SETTINGS_CATEGORY_LABELS,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { joinUrlPath } from "@plane/utils";
// components
import { SettingsSidebarItem } from "@/components/settings/sidebar/item";
// hooks
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";
import { isRequiredActionAllowed } from "@/lib/permissoes/acao-efetiva";
// local imports
import { WORKSPACE_SETTINGS_ICONS } from "./item-icon";

export const WorkspaceSettingsSidebarItemCategories = observer(function WorkspaceSettingsSidebarItemCategories() {
  // params
  const { workspaceSlug } = useParams();
  const pathname = usePathname();
  // store hooks
  const { can } = useMyWorkspaceActions(workspaceSlug?.toString());
  // translation
  const { t } = useTranslation();

  return (
    <div className="mt-3 flex flex-col divide-y divide-subtle px-3">
      {WORKSPACE_SETTINGS_CATEGORIES.map((category) => {
        const categoryItems = GROUPED_WORKSPACE_SETTINGS[category];
        // Cada item pede a ação que a tela de destino exige.
        const accessibleItems = categoryItems.filter((item) => isRequiredActionAllowed(item.action, can));

        if (accessibleItems.length === 0) return null;

        return (
          <div key={category} className="shrink-0 py-3 first:pt-0 last:pb-0">
            <div className="p-2 text-caption-md-medium text-tertiary capitalize">
              {t(WORKSPACE_SETTINGS_CATEGORY_LABELS[category])}
            </div>
            <div className="flex flex-col">
              {accessibleItems.map((item) => {
                const isItemActive =
                  item.href === "/settings"
                    ? pathname === `/${workspaceSlug}${item.href}/`
                    : new RegExp(`^/${workspaceSlug}${item.href}/`).test(pathname);

                return (
                  <SettingsSidebarItem
                    key={item.key}
                    as="link"
                    href={joinUrlPath(workspaceSlug ?? "", item.href)}
                    isActive={isItemActive}
                    icon={WORKSPACE_SETTINGS_ICONS[item.key]}
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
