/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
// plane imports
import type { IWorkspaceSidebarNavigationItem } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { joinUrlPath } from "@plane/utils";
// components
import { SidebarNavItem } from "@/components/sidebar/sidebar-navigation";
import { readRotuloDoItemDaBarra } from "@/components/workspace/sidebar/rotulo-do-item-da-barra";
import { SidebarBadge } from "@/components/workspace/sidebar/sidebar-badge";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useUser } from "@/hooks/store/user";
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";
import { isRequiredActionAllowed } from "@/lib/permissoes/acao-efetiva";
// plane web imports
import { getSidebarNavigationItemIcon } from "@/plane-web/components/workspace/sidebar/helper";

type Props = {
  item: IWorkspaceSidebarNavigationItem;
  additionalRender?: (itemKey: string, workspaceSlug: string) => ReactNode;
};

// Quem decide se o item está fixado é a lista que o renderiza (fixacao-na-barra);
// aqui só se confere se a pessoa pode ver o item.

export const SidebarItemBase = observer(function SidebarItemBase({ item, additionalRender }: Props) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { workspaceSlug } = useParams();
  const { data } = useUser();
  const { can } = useMyWorkspaceActions(workspaceSlug?.toString());

  const { toggleSidebar, isExtendedSidebarOpened, toggleExtendedSidebar } = useAppTheme();

  const handleLinkClick = () => {
    if (window.innerWidth < 768) toggleSidebar();
    if (isExtendedSidebarOpened) toggleExtendedSidebar(false);
  };

  const slug = workspaceSlug?.toString() || "";

  // Item ligado a ação(ões) da matriz (ex.: a wiki) só aparece para quem tem uma delas;
  // sem ação, todo membro do espaço vê.
  if (!isRequiredActionAllowed(item.action, can)) return null;

  const itemHref =
    item.key === "your_work" && data?.id ? joinUrlPath(slug, item.href, data?.id) : joinUrlPath(slug, item.href);
  const icon = getSidebarNavigationItemIcon(item.key);

  return (
    <Link href={itemHref} onClick={handleLinkClick}>
      <SidebarNavItem isActive={item.highlight(pathname, itemHref)}>
        <div className="flex items-center gap-1.5 py-[1px]">
          {icon}
          <p className="text-13 leading-5 font-medium">{t(readRotuloDoItemDaBarra(item, can))}</p>
          <SidebarBadge itemKey={item.key} slug={slug} />
        </div>
        {additionalRender?.(item.key, slug)}
      </SidebarNavItem>
    </Link>
  );
});
