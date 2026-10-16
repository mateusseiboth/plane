/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { DraftIcon, HomeIcon, PiChatLogo, YourWorkIcon, DashboardIcon } from "@plane/propel/icons";
// hooks
import { useUserPermissions, useUser } from "@/hooks/store/user";
// local imports
import { SidebarUserMenuItem } from "./user-menu-item";

export const SidebarUserMenu = observer(function SidebarUserMenu() {
  // navigation
  const { workspaceSlug } = useParams();
  // store hooks
  const { workspaceUserInfo } = useUserPermissions();
  const { data: currentUser } = useUser();

  // Sem `action`: todo membro do espaço vê (tela de leitura).
  const SIDEBAR_USER_MENU_ITEMS = [
    {
      key: "home",
      labelTranslationKey: "sidebar.home",
      href: `/${workspaceSlug.toString()}/`,
      Icon: HomeIcon,
    },
    {
      key: "dashboards",
      labelTranslationKey: "workspace_dashboards",
      href: `/${workspaceSlug.toString()}/dashboards/`,
      Icon: DashboardIcon,
    },
    {
      key: "your-work",
      labelTranslationKey: "sidebar.your_work",
      href: `/${workspaceSlug.toString()}/profile/${currentUser?.id}/`,
      Icon: YourWorkIcon,
    },
    {
      key: "drafts",
      labelTranslationKey: "sidebar.drafts",
      href: `/${workspaceSlug.toString()}/drafts/`,
      // Rascunho é chamado ainda não criado.
      action: "issue.create",
      Icon: DraftIcon,
    },
    {
      key: "pi-chat",
      labelTranslationKey: "sidebar.pi_chat",
      href: `/${workspaceSlug.toString()}/pi-chat/`,
      Icon: PiChatLogo,
    },
  ];

  const draftIssueCount = workspaceUserInfo[workspaceSlug.toString()]?.draft_issue_count;

  return (
    <div className="flex flex-col gap-0.5">
      {SIDEBAR_USER_MENU_ITEMS.map((item) => (
        <SidebarUserMenuItem key={item.key} item={item} draftIssueCount={draftIssueCount} />
      ))}
    </div>
  );
});
