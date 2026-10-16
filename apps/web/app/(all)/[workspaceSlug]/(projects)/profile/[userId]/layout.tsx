/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { usePathname } from "next/navigation";
import { Outlet } from "react-router";
import useSWR from "swr";
// components
import { PROFILE_VIEWER_TAB, PROFILE_ADMINS_TAB } from "@plane/constants";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { ProfileSidebar } from "@/components/profile/sidebar";
// constants
import { USER_PROFILE_PROJECT_SEGREGATION } from "@/constants/fetch-keys";
// hooks
import useSize from "@/hooks/use-window-size";
// local components
import { UserService } from "@/services/user.service";
import type { Route } from "./+types/layout";
import { UserProfileHeader } from "./header";
import { ProfileIssuesMobileHeader } from "./mobile-header";
import { ProfileNavbar } from "./navbar";

const userService = new UserService();

function UseProfileLayout({ params }: Route.ComponentProps) {
  // router
  const { workspaceSlug, userId } = params;
  const pathname = usePathname();
  const windowSize = useSize();
  const isSmallerScreen = windowSize[0] >= 768;

  const { data: userProjectsData } = useSWR(USER_PROFILE_PROJECT_SEGREGATION(workspaceSlug, userId), () =>
    userService.getUserProfileProjectsSegregation(workspaceSlug, userId)
  );
  // derived values
  const isIssuesTab = pathname.includes("assigned") || pathname.includes("created") || pathname.includes("subscribed");

  // O perfil é leitura: todo membro do espaço vê todas as abas.
  const tabsList = [...PROFILE_VIEWER_TAB, ...PROFILE_ADMINS_TAB];
  const currentTab = tabsList.find((tab) => pathname === `/${workspaceSlug}/profile/${userId}${tab.selected}`);

  return (
    <>
      {/* Passing the type prop from the current route value as we need the header as top most component.
            TODO: We are depending on the route path to handle the mobile header type. If the path changes, this logic will break. */}
      <div className="flex h-full w-full flex-col overflow-hidden md:flex-row">
        <div className="flex h-full w-full flex-col overflow-hidden">
          <AppHeader
            header={
              <UserProfileHeader
                type={currentTab?.i18n_label}
                userProjectsData={userProjectsData}
                showProfileIssuesFilter={isIssuesTab}
              />
            }
            mobileHeader={isIssuesTab && <ProfileIssuesMobileHeader />}
          />
          <ContentWrapper>
            <div className="flex h-full w-full flex-row md:flex-col md:overflow-hidden">
              <div className="flex w-full flex-col md:h-full md:overflow-hidden">
                <ProfileNavbar />
                <div className={`h-full w-full overflow-hidden`}>
                  <Outlet />
                </div>
              </div>
              {!isSmallerScreen && <ProfileSidebar userProjectsData={userProjectsData} />}
            </div>
          </ContentWrapper>
        </div>
        {isSmallerScreen && <ProfileSidebar userProjectsData={userProjectsData} />}
      </div>
    </>
  );
}

export default observer(UseProfileLayout);
