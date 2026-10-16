/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { usePathname } from "next/navigation";
import { Outlet } from "react-router";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { getWorkspaceActivePath, pathnameToAccessKey } from "@/components/settings/helper";
import { SettingsMobileNav } from "@/components/settings/mobile/nav";
// plane imports
import { WORKSPACE_SETTINGS_ACTIONS } from "@plane/constants";
// components
import { WorkspaceSettingsSidebarRoot } from "@/components/settings/workspace/sidebar";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";
import { isRequiredActionAllowed } from "@/lib/permissoes/acao-efetiva";

import type { Route } from "./+types/layout";

const WorkspaceSettingLayout = observer(function WorkspaceSettingLayout({ params }: Route.ComponentProps) {
  // router
  const { workspaceSlug } = params;
  // store hooks
  const { workspaceUserInfo } = useUserPermissions();
  const { can, isLoading } = useMyWorkspaceActions(workspaceSlug);
  // next hooks
  const pathname = usePathname();
  // derived values
  const { accessKey } = pathnameToAccessKey(pathname);
  // Tela fora do mapa continua fechada; a do mapa exige a ação da matriz que ela declara.
  const isKnownSetting = accessKey in WORKSPACE_SETTINGS_ACTIONS;
  const isAuthorized = isKnownSetting && isRequiredActionAllowed(WORKSPACE_SETTINGS_ACTIONS[accessKey], can);

  return (
    <>
      <SettingsMobileNav
        hamburgerContent={WorkspaceSettingsSidebarRoot}
        activePath={getWorkspaceActivePath(pathname) || ""}
      />
      <div className="inset-y-0 flex h-full w-full flex-row">
        <div className="relative flex size-full">
          {/* O menu continua à vista: quem não pode esta tela pode ter acesso a outra. */}
          <div className="hidden h-full md:block">
            <WorkspaceSettingsSidebarRoot />
          </div>
          {workspaceUserInfo && !isLoading && !isAuthorized ? (
            <NotAuthorizedView section="settings" className="h-auto" />
          ) : (
            <Outlet />
          )}
        </div>
      </div>
    </>
  );
});

export default WorkspaceSettingLayout;
