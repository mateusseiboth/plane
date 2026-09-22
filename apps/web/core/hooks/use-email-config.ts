/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
// services
import emailConfigService, { type TEmailConfig } from "@/services/email-config.service";

export const EMAIL_CONFIG_KEY = (workspaceSlug: string) => `EMAIL_CONFIG_${workspaceSlug}`;

/** Configuração SMTP da instância, vista pela tela de configurações. */
export const useEmailConfig = (workspaceSlug: string | undefined, enabled = true) => {
  const key = workspaceSlug && enabled ? EMAIL_CONFIG_KEY(workspaceSlug) : null;
  const { data, error, isLoading, isValidating, mutate } = useSWR<TEmailConfig>(
    key,
    key ? () => emailConfigService.read(workspaceSlug!) : null,
    { revalidateOnFocus: false }
  );
  return { config: data, data, error, isLoading, isFetching: isValidating, refetch: mutate };
};
