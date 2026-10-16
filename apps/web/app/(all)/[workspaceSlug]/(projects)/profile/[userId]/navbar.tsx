/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
// plane imports
import { PROFILE_VIEWER_TAB, PROFILE_ADMINS_TAB } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Header, EHeaderVariant } from "@plane/ui";
import { cn } from "@plane/utils";

// O perfil é leitura: todo membro do espaço vê todas as abas.
const PROFILE_TABS = [...PROFILE_VIEWER_TAB, ...PROFILE_ADMINS_TAB];

export function ProfileNavbar() {
  const { t } = useTranslation();
  const { workspaceSlug, userId } = useParams();
  const pathname = usePathname();

  const tabsList = PROFILE_TABS;

  return (
    <Header variant={EHeaderVariant.SECONDARY} showOnMobile={false}>
      <div className="flex items-center overflow-x-scroll">
        {tabsList.map((tab) => (
          <Link key={tab.route} href={`/${workspaceSlug}/profile/${userId}/${tab.route}`}>
            <span
              className={cn(
                `flex border-b-2 p-4 text-13 font-medium whitespace-nowrap text-tertiary outline-none hover:text-primary ${
                  pathname === `/${workspaceSlug}/profile/${userId}${tab.selected}`
                    ? "border-accent-strong text-accent-primary hover:text-accent-primary"
                    : "border-transparent"
                }`
              )}
            >
              {t(tab.i18n_label)}
            </span>
          </Link>
        ))}
      </div>
    </Header>
  );
}
