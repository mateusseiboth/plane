/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// store
import type { IWorkspacePageStore } from "@/store/pages/workspace-page.store";
import { WorkspacePageStore } from "@/store/pages/workspace-page.store";
import { CoreRootStore } from "@/store/root.store";
import type { ITimelineStore } from "./timeline";
import { TimeLineStore } from "./timeline";

export class RootStore extends CoreRootStore {
  timelineStore: ITimelineStore;
  /** Wiki do espaço de trabalho (páginas sem sistema). */
  workspacePages: IWorkspacePageStore;

  constructor() {
    super();

    this.timelineStore = new TimeLineStore(this);
    this.workspacePages = new WorkspacePageStore(this);
  }

  resetOnSignOut() {
    super.resetOnSignOut();
    this.workspacePages = new WorkspacePageStore(this);
  }
}
