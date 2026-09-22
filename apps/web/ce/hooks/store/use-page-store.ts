/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useContext } from "react";
// context
import { StoreContext } from "@/lib/store-context";
// mobx store
import type { IProjectPageStore } from "@/store/pages/project-page.store";
import type { IWorkspacePageStore } from "@/store/pages/workspace-page.store";
import type { RootStore } from "@/plane-web/store/root.store";

/** Onde a página mora: num sistema ou na wiki do espaço. */
export const EPageStoreType = {
  PROJECT: "PROJECT_PAGE",
  WORKSPACE: "WORKSPACE_PAGE",
} as const;
export type EPageStoreType = (typeof EPageStoreType)[keyof typeof EPageStoreType];

export type TReturnType = {
  [EPageStoreType.PROJECT]: IProjectPageStore;
  [EPageStoreType.WORKSPACE]: IWorkspacePageStore;
};

/** Um store por tipo: tipo novo é uma linha aqui. */
const PAGE_STORES: { [K in EPageStoreType]: (context: RootStore) => TReturnType[K] } = {
  [EPageStoreType.PROJECT]: (context) => context.projectPages,
  [EPageStoreType.WORKSPACE]: (context) => context.workspacePages,
};

export const usePageStore = <T extends EPageStoreType>(storeType: T): TReturnType[T] => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("usePageStore must be used within StoreProvider");

  const pickStore = PAGE_STORES[storeType];
  if (!pickStore) throw new Error(`Invalid store type: ${storeType}`);
  return pickStore(context);
};
