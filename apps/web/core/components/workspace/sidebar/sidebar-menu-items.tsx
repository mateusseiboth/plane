/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useMemo } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Ellipsis, LayoutDashboard } from "lucide-react";
import { Disclosure, Transition } from "@headlessui/react";
// plane imports
import { WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS_LINKS, EUserPermissionsLevel } from "@plane/constants";
import { EUserWorkspaceRoles } from "@plane/types";
import { useTranslation } from "@plane/i18n";
import { ChevronRightIcon } from "@plane/propel/icons";
import { cn } from "@plane/utils";
// components
import { SidebarNavItem } from "@/components/sidebar/sidebar-navigation";
import {
  ITENS_DO_ESPACO_NA_BARRA,
  ITENS_PESSOAIS_DA_BARRA,
  buildItensDaBarra,
} from "@/components/workspace/sidebar/fixacao-na-barra";
// store hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useUserPermissions } from "@/hooks/store/user";
import useLocalStorage from "@/hooks/use-local-storage";
import { useWorkspaceNavigationPreferences } from "@/hooks/use-navigation-preferences";
// plane-web imports
import { SidebarItem } from "@/plane-web/components/workspace/sidebar/sidebar-item";
// plugin imports
import { PluginSidebarItems } from "@/components/plugins/plugin-sidebar-items";

export const SidebarMenuItems = observer(function SidebarMenuItems() {
  // routers
  const { setValue: toggleWorkspaceMenu, storedValue: isWorkspaceMenuOpen } = useLocalStorage<boolean>(
    "is_workspace_menu_open",
    true
  );
  const { workspaceSlug } = useParams();
  const pathname = usePathname();

  // store hooks
  const { isExtendedSidebarOpened, toggleExtendedSidebar } = useAppTheme();
  const { allowPermissions } = useUserPermissions();
  // hooks
  const { preferences: workspacePreferences } = useWorkspaceNavigationPreferences();

  const canAccessExtensions = allowPermissions(
    [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.GESTOR_PROJETO, EUserWorkspaceRoles.TI],
    EUserPermissionsLevel.WORKSPACE
  );
  // translation
  const { t } = useTranslation();

  const toggleListDisclosure = (isOpen: boolean) => {
    toggleWorkspaceMenu(isOpen);
  };

  // Página inicial sempre; os pessoais e os do espaço só quando fixados.
  const itensPessoais = useMemo(
    () => [
      ...WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS_LINKS,
      ...buildItensDaBarra(ITENS_PESSOAIS_DA_BARRA, workspacePreferences.items),
    ],
    [workspacePreferences]
  );

  const itensDoEspaco = useMemo(
    () => buildItensDaBarra(ITENS_DO_ESPACO_NA_BARRA, workspacePreferences.items),
    [workspacePreferences]
  );

  return (
    <>
      <div className="flex flex-col gap-0.5">
        {itensPessoais.map((item) => (
          <SidebarItem key={item.key} item={item} />
        ))}
      </div>
      <Disclosure as="div" className="flex flex-col" defaultOpen={!!isWorkspaceMenuOpen}>
        <div className="group flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-placeholder hover:bg-layer-transparent-hover">
          <Disclosure.Button
            as="button"
            type="button"
            className="flex w-full items-center gap-1 text-left text-13 font-semibold whitespace-nowrap text-placeholder"
            onClick={() => toggleListDisclosure(!isWorkspaceMenuOpen)}
            aria-label={t(
              isWorkspaceMenuOpen
                ? "aria_labels.app_sidebar.close_workspace_menu"
                : "aria_labels.app_sidebar.open_workspace_menu"
            )}
          >
            <span className="text-13 font-semibold">{t("common.workspace")}</span>
          </Disclosure.Button>
          <div className="pointer-events-none flex items-center opacity-0 group-hover:pointer-events-auto group-hover:opacity-100">
            <Disclosure.Button
              as="button"
              type="button"
              className="flex-shrink-0 rounded-sm p-0.5 hover:bg-layer-1"
              onClick={() => toggleListDisclosure(!isWorkspaceMenuOpen)}
              aria-label={t(
                isWorkspaceMenuOpen
                  ? "aria_labels.app_sidebar.close_workspace_menu"
                  : "aria_labels.app_sidebar.open_workspace_menu"
              )}
            >
              <ChevronRightIcon
                className={cn("size-3 flex-shrink-0 transition-all", {
                  "rotate-90": isWorkspaceMenuOpen,
                })}
              />
            </Disclosure.Button>
          </div>
        </div>
        <Transition
          show={!!isWorkspaceMenuOpen}
          enter="transition duration-100 ease-out"
          enterFrom="transform scale-95 opacity-0"
          enterTo="transform scale-100 opacity-100"
          leave="transition duration-75 ease-out"
          leaveFrom="transform scale-100 opacity-100"
          leaveTo="transform scale-95 opacity-0"
        >
          {isWorkspaceMenuOpen && (
            <Disclosure.Panel as="div" className="flex flex-col gap-0.5" static>
              <>
                {itensDoEspaco.map((item) => (
                  <SidebarItem key={item.key} item={item} />
                ))}
                <PluginSidebarItems />
                {canAccessExtensions && (
                  <>
                    <Link href={`/${workspaceSlug}/developers/widgets`}>
                      <SidebarNavItem isActive={pathname?.startsWith(`/${workspaceSlug}/developers`) ?? false}>
                        <div className="flex w-full items-center gap-1.5 truncate">
                          <LayoutDashboard className="size-4 flex-shrink-0" />
                          <span className="truncate text-13 font-medium">Widgets</span>
                        </div>
                      </SidebarNavItem>
                    </Link>
                  </>
                )}
                <SidebarNavItem>
                  <button
                    type="button"
                    onClick={() => toggleExtendedSidebar()}
                    className="flex flex-grow items-center gap-1.5 text-13 font-medium text-tertiary"
                    id="extended-sidebar-toggle"
                    aria-label={t(
                      isExtendedSidebarOpened
                        ? "aria_labels.app_sidebar.close_extended_sidebar"
                        : "aria_labels.app_sidebar.open_extended_sidebar"
                    )}
                  >
                    <Ellipsis className="size-4 flex-shrink-0" />
                    <span>{isExtendedSidebarOpened ? "Ocultar" : "Mais"}</span>
                  </button>
                </SidebarNavItem>
              </>
            </Disclosure.Panel>
          )}
        </Transition>
      </Disclosure>
    </>
  );
});
