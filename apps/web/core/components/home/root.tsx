/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams, usePathname } from "next/navigation";
import useSWR from "swr";
// plane imports
import { ContentWrapper } from "@plane/ui";
// hooks
import { useUser, useUserProfile } from "@/hooks/store/user";
// plane web imports
import { HomePeekOverviewsRoot } from "@/plane-web/components/home";
import { HomePageHeader } from "@/plane-web/components/home/header";
import { TourRoot } from "@/plane-web/components/onboarding/tour/root";
// services
import { homeSummaryService } from "@/services/home-summary.service";
// local imports
import { PainelDaHome } from "./painel/painel-da-home";
import { buildResumoDoDia } from "./painel/painel-rules";
import { UserGreetingsView } from "./user-greetings";
import { NoProjectsEmptyState } from "./widgets";
import { MarketplaceWidgetsSection } from "./widgets/marketplace-widgets-section";

export const WorkspaceHomeView = observer(function WorkspaceHomeView() {
  // store hooks
  const { workspaceSlug } = useParams();
  const pathname = usePathname();
  const { data: currentUser } = useUser();
  const { data: currentUserProfile, updateTourCompleted } = useUserProfile();
  const slug = workspaceSlug?.toString() ?? "";
  const isWikiApp = pathname.includes(`/${slug}/pages`);

  const { data: resumo } = useSWR(slug ? `HOME_SUMMARY_${slug}` : null, () => homeSummaryService.summary(slug), {
    revalidateOnFocus: false,
  });

  const handleTourCompleted = async () => {
    try {
      await updateTourCompleted();
    } catch (error) {
      console.error("Error updating tour completed", error);
    }
  };

  return (
    <>
      {currentUserProfile && !currentUserProfile.is_tour_completed && (
        <div className="fixed top-0 left-0 z-20 grid h-full w-full place-items-center overflow-y-auto bg-backdrop transition-opacity">
          <TourRoot onComplete={handleTourCompleted} />
        </div>
      )}
      <HomePeekOverviewsRoot />
      {/* Fundo cinza no claro, cartões brancos por cima; no escuro o fundo é o
          surface-1 e os cartões sobem para o layer-1. */}
      <ContentWrapper className="scrollbar-hide bg-surface-2 px-page-x dark:bg-surface-1">
        <div className="mx-auto flex w-full max-w-360 flex-col gap-5 pt-2 pb-10">
          <div className="flex flex-wrap items-start justify-between gap-3">
            {currentUser ? <UserGreetingsView user={currentUser} resumo={buildResumoDoDia(resumo)} /> : <div />}
            <HomePageHeader />
          </div>
          {!isWikiApp && <NoProjectsEmptyState />}
          {slug && currentUser && <PainelDaHome workspaceSlug={slug} userId={currentUser.id} />}
          {!isWikiApp && <MarketplaceWidgetsSection />}
        </div>
      </ContentWrapper>
    </>
  );
});
