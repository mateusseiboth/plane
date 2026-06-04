/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Quem pode gerenciar extensões (plugins/widgets) no UI: admins de instância OU
// usuários do grupo TI (role 12 em qualquer workspace). Espelha o gate do backend
// (utils/registry-access.ts). Use dentro de componentes `observer` (lê mobx).

import useSWR from "swr";
import { EUserPermissions } from "@plane/constants";
import { useUserPermissions } from "@/hooks/store/user";
import userService from "@/services/user.service";

export function useCanManageExtensions(): boolean {
  const userPermissions = useUserPermissions();

  const { data: adminStatus } = useSWR(
    "CURRENT_USER_INSTANCE_ADMIN_STATUS",
    () => userService.currentUserInstanceAdminStatus(),
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
  if (adminStatus?.is_instance_admin) return true;

  const info = (userPermissions as unknown as { workspaceUserInfo?: Record<string, { role?: number }> }).workspaceUserInfo;
  if (info) {
    for (const v of Object.values(info)) {
      if (v?.role === EUserPermissions.TI) return true;
    }
  }
  return false;
}
