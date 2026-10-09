/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo, useRef } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { EUserPermissionsLevel } from "@plane/constants";
import type { EUserWorkspaceRoles } from "@plane/types";
// components
import { ITENS_DO_MENU_MAIS, buildItensDoMenuMais } from "@/components/workspace/sidebar/fixacao-na-barra";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useUserPermissions } from "@/hooks/store/user";
import { useWorkspaceNavigationPreferences } from "@/hooks/use-navigation-preferences";
// plane-web imports
import { ExtendedSidebarItem } from "@/plane-web/components/workspace/sidebar/extended-sidebar-item";
import { ExtendedSidebarWrapper } from "./extended-sidebar-wrapper";

export const ExtendedAppSidebar = observer(function ExtendedAppSidebar() {
  // refs
  const extendedSidebarRef = useRef<HTMLDivElement | null>(null);
  // routers
  const { workspaceSlug } = useParams();
  // store hooks
  const { isExtendedSidebarOpened, toggleExtendedSidebar } = useAppTheme();
  const { allowPermissions } = useUserPermissions();
  const { preferences: workspacePreferences, updateWorkspaceItemSortOrder } = useWorkspaceNavigationPreferences();

  // derived values
  const currentWorkspaceNavigationPreferences = workspacePreferences.items;

  const sortedNavigationItems = useMemo(() => {
    const slug = workspaceSlug.toString();

    const permitidos = ITENS_DO_MENU_MAIS.filter((item) =>
      allowPermissions(item.access, EUserPermissionsLevel.WORKSPACE, slug)
    );

    return buildItensDoMenuMais(permitidos, currentWorkspaceNavigationPreferences);
  }, [workspaceSlug, currentWorkspaceNavigationPreferences, allowPermissions]);

  const sortedNavigationItemsKeys = sortedNavigationItems.map((item) => item.key);

  const orderNavigationItem = (
    sourceIndex: number,
    destinationIndex: number,
    navigationList: {
      sort_order: number;
      key: string;
      labelTranslationKey: string;
      href: string;
      access: EUserWorkspaceRoles[];
    }[]
  ): number | undefined => {
    if (sourceIndex < 0 || destinationIndex < 0 || navigationList.length <= 0) return undefined;

    let updatedSortOrder: number | undefined = undefined;
    const sortOrderDefaultValue = 10000;

    if (destinationIndex === 0) {
      // updating project at the top of the project
      const currentSortOrder = navigationList[destinationIndex].sort_order || 0;
      updatedSortOrder = currentSortOrder - sortOrderDefaultValue;
    } else if (destinationIndex === navigationList.length) {
      // updating project at the bottom of the project
      const currentSortOrder = navigationList[destinationIndex - 1].sort_order || 0;
      updatedSortOrder = currentSortOrder + sortOrderDefaultValue;
    } else {
      // updating project in the middle of the project
      const destinationTopProjectSortOrder = navigationList[destinationIndex - 1].sort_order || 0;
      const destinationBottomProjectSortOrder = navigationList[destinationIndex].sort_order || 0;
      const updatedValue = (destinationTopProjectSortOrder + destinationBottomProjectSortOrder) / 2;
      updatedSortOrder = updatedValue;
    }

    return updatedSortOrder;
  };

  const handleOnNavigationItemDrop = (
    sourceId: string | undefined,
    destinationId: string | undefined,
    shouldDropAtEnd: boolean
  ) => {
    if (!sourceId || !destinationId || !workspaceSlug) return;
    if (sourceId === destinationId) return;

    const sourceIndex = sortedNavigationItemsKeys.indexOf(sourceId);
    const destinationIndex = shouldDropAtEnd
      ? sortedNavigationItemsKeys.length
      : sortedNavigationItemsKeys.indexOf(destinationId);

    const updatedSortOrder = orderNavigationItem(sourceIndex, destinationIndex, sortedNavigationItems);

    if (updatedSortOrder != undefined) updateWorkspaceItemSortOrder(sourceId, updatedSortOrder);
  };

  const handleClose = useCallback(() => toggleExtendedSidebar(false), [toggleExtendedSidebar]);

  return (
    <ExtendedSidebarWrapper
      isExtendedSidebarOpened={!!isExtendedSidebarOpened}
      extendedSidebarRef={extendedSidebarRef}
      handleClose={handleClose}
      excludedElementId="extended-sidebar-toggle"
    >
      {sortedNavigationItems.map((item, index) => (
        <ExtendedSidebarItem
          key={item.key}
          item={item}
          isLastChild={index === sortedNavigationItems.length - 1}
          handleOnNavigationItemDrop={handleOnNavigationItemDrop}
        />
      ))}
    </ExtendedSidebarWrapper>
  );
});
