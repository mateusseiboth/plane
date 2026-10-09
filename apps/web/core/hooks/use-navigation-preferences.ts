/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import type {
  TPersonalNavigationItemKey,
  TPersonalNavigationPreferences,
  TProjectNavigationPreferences,
  TProjectNavigationMode,
  TWorkspaceNavigationPreferences,
  TWorkspaceNavigationItemState,
  TAppRailPreferences,
  TAppRailDisplayMode,
} from "@/types/navigation-preferences";
import {
  DEFAULT_PERSONAL_PREFERENCES,
  DEFAULT_PROJECT_PREFERENCES,
  DEFAULT_WORKSPACE_PREFERENCES,
  DEFAULT_APP_RAIL_PREFERENCES,
} from "@/types/navigation-preferences";
import { isItemFixadoNaBarra } from "@/components/workspace/sidebar/fixacao-na-barra";
import { useWorkspace } from "./store/use-workspace";
import useLocalStorage from "./use-local-storage";

const APP_RAIL_PREFERENCES_KEY = "app_rail_preferences";

export const usePersonalNavigationPreferences = () => {
  const { workspaceSlug } = useParams();
  const { getNavigationPreferences, updateBulkSidebarPreferences } = useWorkspace();

  // Get preferences from the store
  const storePreferences = getNavigationPreferences(workspaceSlug?.toString() || "");

  // Convert store format to hook format for personal items
  const preferences: TPersonalNavigationPreferences = useMemo(() => {
    if (!storePreferences) {
      return DEFAULT_PERSONAL_PREFERENCES;
    }

    // Extract personal items from the store (stickies, your_work, drafts)
    const readItemPessoal = (key: TPersonalNavigationItemKey) => ({
      enabled: isItemFixadoNaBarra(key, storePreferences),
      sort_order: storePreferences[key]?.sort_order ?? DEFAULT_PERSONAL_PREFERENCES.items[key].sort_order,
    });
    const personalItems: Record<TPersonalNavigationItemKey, { enabled: boolean; sort_order: number }> = {
      stickies: readItemPessoal("stickies"),
      your_work: readItemPessoal("your_work"),
      drafts: readItemPessoal("drafts"),
    };

    return {
      items: personalItems,
    };
  }, [storePreferences]);

  const togglePersonalItem = useCallback(
    async (key: TPersonalNavigationItemKey, enabled: boolean) => {
      if (!workspaceSlug) return;

      const currentItem = preferences.items[key] || { enabled: false, sort_order: 0 };

      await updateBulkSidebarPreferences(workspaceSlug.toString(), [
        {
          key,
          is_pinned: enabled,
          sort_order: currentItem.sort_order,
        },
      ]);
    },
    [workspaceSlug, preferences, updateBulkSidebarPreferences]
  );

  const updatePersonalItemOrder = useCallback(
    async (items: Array<{ key: TPersonalNavigationItemKey; sortOrder: number }>) => {
      if (!workspaceSlug) return;

      const bulkData = items.map((item) => {
        const currentItem = preferences.items[item.key] || { enabled: true, sort_order: 0 };
        return {
          key: item.key,
          is_pinned: currentItem.enabled,
          sort_order: item.sortOrder,
        };
      });

      await updateBulkSidebarPreferences(workspaceSlug.toString(), bulkData);
    },
    [workspaceSlug, preferences, updateBulkSidebarPreferences]
  );

  const isPersonalItemEnabled = useCallback(
    (key: TPersonalNavigationItemKey): boolean => preferences.items[key]?.enabled ?? true,
    [preferences]
  );

  return {
    preferences,
    togglePersonalItem,
    updatePersonalItemOrder,
    isPersonalItemEnabled,
  };
};

export const useProjectNavigationPreferences = () => {
  const { workspaceSlug } = useParams();
  const { getProjectNavigationPreferences, updateProjectNavigationPreferences } = useWorkspace();

  // Get preferences from the store
  const storePreferences = getProjectNavigationPreferences(workspaceSlug?.toString() || "");

  // Computed preferences with fallback logic: API → defaults
  const preferences: TProjectNavigationPreferences = useMemo(() => {
    // 1. Try API data first
    if (
      storePreferences &&
      (storePreferences.navigation_control_preference || storePreferences.navigation_project_limit !== undefined)
    ) {
      const limit = storePreferences.navigation_project_limit ?? DEFAULT_PROJECT_PREFERENCES.limitedProjectsCount;

      return {
        navigationMode: storePreferences.navigation_control_preference || DEFAULT_PROJECT_PREFERENCES.navigationMode,
        limitedProjectsCount: limit > 0 ? limit : DEFAULT_PROJECT_PREFERENCES.limitedProjectsCount,
        showLimitedProjects: limit > 0, // Derived: 0 = false, >0 = true
      };
    }

    // 2. Fall back to defaults
    return DEFAULT_PROJECT_PREFERENCES;
  }, [storePreferences]);

  // Update navigation mode
  const updateNavigationMode = useCallback(
    async (mode: TProjectNavigationMode) => {
      if (!workspaceSlug) return;

      await updateProjectNavigationPreferences(workspaceSlug.toString(), {
        navigation_control_preference: mode,
      });
    },
    [workspaceSlug, updateProjectNavigationPreferences]
  );

  // Update show limited projects
  const updateShowLimitedProjects = useCallback(
    async (show: boolean) => {
      if (!workspaceSlug) return;

      // When toggling off, set to 0; when toggling on, use current count or default
      const newLimit = show ? preferences.limitedProjectsCount || DEFAULT_PROJECT_PREFERENCES.limitedProjectsCount : 0;

      await updateProjectNavigationPreferences(workspaceSlug.toString(), {
        navigation_project_limit: newLimit,
      });
    },
    [workspaceSlug, updateProjectNavigationPreferences, preferences.limitedProjectsCount]
  );

  // Update limited projects count
  const updateLimitedProjectsCount = useCallback(
    async (count: number) => {
      if (!workspaceSlug) return;

      await updateProjectNavigationPreferences(workspaceSlug.toString(), {
        navigation_project_limit: count,
      });
    },
    [workspaceSlug, updateProjectNavigationPreferences]
  );

  return {
    preferences,
    updateNavigationMode,
    updateShowLimitedProjects,
    updateLimitedProjectsCount,
  };
};

export const useWorkspaceNavigationPreferences = () => {
  const { workspaceSlug } = useParams();
  const { getNavigationPreferences, updateBulkSidebarPreferences } = useWorkspace();

  // Get preferences from the store
  const storePreferences = getNavigationPreferences(workspaceSlug?.toString() || "");

  // Convert store format to hook format
  const preferences: TWorkspaceNavigationPreferences = useMemo(() => {
    if (!storePreferences) {
      return DEFAULT_WORKSPACE_PREFERENCES;
    }

    return {
      items: storePreferences,
    };
  }, [storePreferences]);

  const toggleWorkspaceItem = useCallback(
    async (key: string, isPinned: boolean) => {
      if (!workspaceSlug) return;

      await updateBulkSidebarPreferences(workspaceSlug.toString(), [
        {
          key,
          is_pinned: isPinned,
          sort_order: preferences.items[key]?.sort_order ?? 0,
        },
      ]);
    },
    [workspaceSlug, preferences, updateBulkSidebarPreferences]
  );

  const updateWorkspaceItemOrder = useCallback(
    async (items: Array<{ key: string; sortOrder: number }>) => {
      if (!workspaceSlug) return;

      const bulkData = items.map((item) => ({
        key: item.key,
        is_pinned: isItemFixadoNaBarra(item.key, preferences.items),
        sort_order: item.sortOrder,
      }));

      await updateBulkSidebarPreferences(workspaceSlug.toString(), bulkData);
    },
    [workspaceSlug, preferences, updateBulkSidebarPreferences]
  );

  const getWorkspaceItemState = useCallback(
    (key: string): TWorkspaceNavigationItemState => ({
      is_pinned: isItemFixadoNaBarra(key, preferences.items),
      sort_order: preferences.items[key]?.sort_order ?? 0,
    }),
    [preferences]
  );

  const isWorkspaceItemPinned = useCallback(
    (key: string): boolean => {
      const state = getWorkspaceItemState(key);
      return state.is_pinned;
    },
    [getWorkspaceItemState]
  );

  const updateWorkspaceItemSortOrder = useCallback(
    async (key: string, sortOrder: number) => {
      if (!workspaceSlug) return;

      await updateBulkSidebarPreferences(workspaceSlug.toString(), [
        {
          key,
          is_pinned: isItemFixadoNaBarra(key, preferences.items),
          sort_order: sortOrder,
        },
      ]);
    },
    [workspaceSlug, preferences, updateBulkSidebarPreferences]
  );

  return {
    preferences,
    toggleWorkspaceItem,
    updateWorkspaceItemOrder,
    updateWorkspaceItemSortOrder,
    getWorkspaceItemState,
    isWorkspaceItemPinned,
  };
};

export const useAppRailPreferences = () => {
  const { storedValue, setValue } = useLocalStorage<TAppRailPreferences>(
    APP_RAIL_PREFERENCES_KEY,
    DEFAULT_APP_RAIL_PREFERENCES
  );

  const updateDisplayMode = useCallback(
    (mode: TAppRailDisplayMode) => {
      setValue({
        displayMode: mode,
      });
    },
    [setValue]
  );

  const toggleDisplayMode = useCallback(() => {
    const currentPreferences = storedValue || DEFAULT_APP_RAIL_PREFERENCES;
    const newMode = currentPreferences.displayMode === "icon_only" ? "icon_with_label" : "icon_only";
    updateDisplayMode(newMode);
  }, [storedValue, updateDisplayMode]);

  return {
    preferences: storedValue || DEFAULT_APP_RAIL_PREFERENCES,
    updateDisplayMode,
    toggleDisplayMode,
  };
};
