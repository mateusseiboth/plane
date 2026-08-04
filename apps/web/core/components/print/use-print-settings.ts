/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import type { TWorkspacePrintSettings } from "@plane/types";
// services
import { WorkspaceService } from "@/services/workspace.service";

const workspaceService = new WorkspaceService();

export const PRINT_SETTINGS_DEFAULTS: TWorkspacePrintSettings = {
  logo_asset: null,
  logo_url: null,
  header_text: null,
  footer_text: null,
  show_generated_at: true,
};

export const printSettingsCacheKey = (workspaceSlug: string) => `WORKSPACE_PRINT_SETTINGS_${workspaceSlug}`;

/**
 * Reads the workspace-wide print settings (logo + header/footer texts).
 * Every member can read them, so this is safe to call from any screen.
 */
export const usePrintSettings = (workspaceSlugOverride?: string) => {
  const params = useParams();
  const workspaceSlug = workspaceSlugOverride ?? (params?.workspaceSlug as string | undefined);

  const { data, isLoading, error, mutate } = useSWR(
    workspaceSlug ? printSettingsCacheKey(workspaceSlug) : null,
    workspaceSlug ? () => workspaceService.getPrintSettings(workspaceSlug) : null,
    { revalidateOnFocus: false, errorRetryCount: 1 }
  );

  return {
    printSettings: data ?? PRINT_SETTINGS_DEFAULTS,
    isLoading,
    error,
    mutate,
  };
};
