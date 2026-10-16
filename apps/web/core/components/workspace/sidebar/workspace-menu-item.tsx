/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
// components
import { SidebarNavItem } from "@/components/sidebar/sidebar-navigation";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";
import { isRequiredActionAllowed } from "@/lib/permissoes/acao-efetiva";
import type { TRequiredAction } from "@/lib/permissoes/acao-efetiva";
// plane web imports
import { UpgradeBadge } from "@/plane-web/components/workspace/upgrade-badge";

export type SidebarWorkspaceMenuItemProps = {
  item: {
    labelTranslationKey: string;
    key: string;
    href: string;
    Icon: any;
    /** Ação da matriz exigida; sem ação, todo membro do espaço vê. */
    action?: TRequiredAction;
  };
};

export const SidebarWorkspaceMenuItem = observer(function SidebarWorkspaceMenuItem(
  props: SidebarWorkspaceMenuItemProps
) {
  const { item } = props;

  const { t } = useTranslation();
  // nextjs hooks
  const pathname = usePathname();
  const { workspaceSlug } = useParams();
  const { can } = useMyWorkspaceActions(workspaceSlug?.toString());
  // store hooks
  const { toggleSidebar } = useAppTheme();

  const handleLinkClick = () => {
    if (window.innerWidth < 768) {
      toggleSidebar();
    }
  };

  if (!isRequiredActionAllowed(item.action, can)) return null;

  const isActive = item.href === pathname;

  return (
    <Link href={item.href} onClick={() => handleLinkClick()}>
      <SidebarNavItem isActive={isActive}>
        <div className="flex items-center gap-1.5 py-[1px]">
          <item.Icon
            className={cn("size-4", {
              "rotate-180": item.key === "active_cycles",
            })}
          />
          <p className="text-13 leading-5 font-medium">{t(item.labelTranslationKey)}</p>
        </div>
        <div className="flex-shrink-0">
          <UpgradeBadge />
        </div>
      </SidebarNavItem>
    </Link>
  );
});
