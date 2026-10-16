/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Quem pode gerenciar extensões (plugins/widgets) no UI: admin da instância, ou
// quem tem `extension.upload` ou `plugin.manage` em algum espaço de que participa.
// As telas de extensões ficam em /settings/ (sem espaço na rota), e o backend
// (utils/registry-access.ts) aceita a ação em QUALQUER espaço: por isso a matriz
// de todos os espaços da pessoa. Use dentro de componentes `observer` (lê mobx).

import useSWR from "swr";
import { isExtensionManager } from "@/hooks/extensions-access";
import { useUserPermissions } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
import userService from "@/services/user.service";

const SWR_ONCE = { revalidateOnFocus: false, shouldRetryOnError: false } as const;

export function useCanManageExtensions(): boolean {
  const { fetchMyWorkspaceActions } = useUserPermissions();
  const { workspaces } = useWorkspace();
  const slugs = Object.values(workspaces ?? {}).map((workspace) => workspace.slug);

  const { data: adminStatus } = useSWR(
    "CURRENT_USER_INSTANCE_ADMIN_STATUS",
    () => userService.currentUserInstanceAdminStatus(),
    SWR_ONCE
  );
  const { data: workspacesActions } = useSWR(
    slugs.length > 0 ? `EXTENSIONS_ACCESS_ACTIONS_${slugs.join(",")}` : null,
    () => Promise.all(slugs.map((slug) => fetchMyWorkspaceActions(slug))),
    SWR_ONCE
  );

  return isExtensionManager(!!adminStatus?.is_instance_admin, workspacesActions ?? []);
}
