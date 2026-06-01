/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TPageFlagHookArgs = {
  workspaceSlug: string;
};

export type TPageFlagHookReturnType = {
  isMovePageEnabled: boolean;
  isPageSharingEnabled: boolean;
};

// Paywall removed in this fork: page move and page sharing are enabled for everyone.
export const usePageFlag = (_args: TPageFlagHookArgs): TPageFlagHookReturnType => ({
  isMovePageEnabled: true,
  isPageSharingEnabled: true,
});
