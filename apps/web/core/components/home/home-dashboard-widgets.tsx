/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams, usePathname } from "next/navigation";
import useSWR from "swr";
// plane imports
import type { THomeWidgetKeys, THomeWidgetProps } from "@plane/types";
// components
// hooks
import { useHome } from "@/hooks/store/use-home";
import { useProject } from "@/hooks/store/use-project";
import { useUser } from "@/hooks/store/user";
// plane web components
import { HomePageHeader } from "@/plane-web/components/home/header";
// services
import { homeSummaryService } from "@/services/home-summary.service";
// local imports
import { StickiesWidget } from "../stickies/widget";
import { UserGreetingsView } from "./user-greetings";
import { HomeLoader, NoProjectsEmptyState, RecentActivityWidget } from "./widgets";
import { DashboardQuickLinks } from "./widgets/links";
import { ManageWidgetsModal } from "./widgets/manage";
import { MyWorkItemsWidget } from "./widgets/my-work-items";
import { UpcomingDatesWidget } from "./widgets/upcoming-dates";
import { OpenIntakesWidget } from "./widgets/open-intakes";
import { CriticalIssuesWidget } from "./widgets/critical-issues";
import { MarketplaceWidgetsSection } from "./widgets/marketplace-widgets-section";
import { HomeSummaryStrip } from "./widgets/summary-strip";
import { MyWorkBreakdownWidget } from "./widgets/my-work-breakdown";
import { OverdueWidget } from "./widgets/overdue-list";

export const HOME_WIDGETS_LIST: {
  [key in THomeWidgetKeys]: {
    component: React.FC<THomeWidgetProps> | null;
    fullWidth: boolean;
    title: string;
  };
} = {
  quick_links: {
    component: DashboardQuickLinks,
    fullWidth: false,
    title: "home.quick_links.title_plural",
  },
  recents: {
    component: RecentActivityWidget,
    fullWidth: false,
    title: "home.recents.title",
  },
  my_stickies: {
    component: StickiesWidget,
    fullWidth: false,
    title: "stickies.title",
  },
  new_at_plane: {
    component: null,
    fullWidth: false,
    title: "home.new_at_plane.title",
  },
  quick_tutorial: {
    component: null,
    fullWidth: false,
    title: "home.quick_tutorial.title",
  },
  my_work_items: {
    component: MyWorkItemsWidget,
    fullWidth: false,
    title: "home.my_work_items.title",
  },
  upcoming_dates: {
    component: UpcomingDatesWidget,
    fullWidth: false,
    title: "home.upcoming_dates.title",
  },
  open_intakes: {
    component: OpenIntakesWidget,
    fullWidth: false,
    title: "home.open_intakes.title",
  },
};

/** Já renderizados de forma fixa acima; não podem repetir na lista opcional. */
const WIDGETS_JA_FIXOS: THomeWidgetKeys[] = ["my_work_items", "open_intakes", "upcoming_dates", "quick_links"];

export const DashboardWidgets = observer(function DashboardWidgets() {
  // router
  const { workspaceSlug } = useParams();
  // navigation
  const pathname = usePathname();
  // store hooks
  const { toggleWidgetSettings, widgetsMap, showWidgetSettings, orderedWidgets, isAnyWidgetEnabled, loading } =
    useHome();
  const { loader } = useProject();
  const { data: currentUser } = useUser();
  // derived values

  // derived values
  const slug = workspaceSlug?.toString() ?? "";
  const isWikiApp = pathname.includes(`/${slug}/pages`);

  const { data: resumo, isLoading: carregandoResumo } = useSWR(
    slug ? `HOME_SUMMARY_${slug}` : null,
    slug ? () => homeSummaryService.summary(slug) : null,
    { revalidateOnFocus: false }
  );
  const { data: atrasados, isLoading: carregandoAtrasados } = useSWR(
    slug ? `HOME_OVERDUE_${slug}` : null,
    slug ? () => homeSummaryService.overdue(slug) : null,
    { revalidateOnFocus: false }
  );

  /** Uma linha de contexto ao lado da data, no lugar de um número solto. */
  const frase = (() => {
    if (!resumo) return undefined;
    if (resumo.meus_atrasados > 0) {
      return `${resumo.meus_atrasados} chamado${resumo.meus_atrasados > 1 ? "s" : ""} passou do prazo`;
    }
    if (resumo.meus_vencem_hoje > 0) {
      return `${resumo.meus_vencem_hoje} chamado${resumo.meus_vencem_hoje > 1 ? "s" : ""} vence hoje`;
    }
    if (resumo.meus_abertos > 0) return `${resumo.meus_abertos} chamados abertos com você`;
    return "Nenhum chamado aberto com você";
  })();

  if (!workspaceSlug) return null;
  if (loading || loader !== "loaded") return <HomeLoader />;

  return (
    <div className="relative flex h-full w-full flex-col gap-6">
      <ManageWidgetsModal
        workspaceSlug={workspaceSlug.toString()}
        isModalOpen={showWidgetSettings}
        handleOnClose={() => toggleWidgetSettings(false)}
      />

      {/* Cabeçalho: saudação à esquerda, ações à direita. */}
      <div className="flex flex-wrap items-start justify-between gap-3 pt-2">
        {currentUser ? <UserGreetingsView user={currentUser} resumo={frase} /> : <div />}
        <HomePageHeader />
      </div>

      {!isWikiApp && <NoProjectsEmptyState />}

      {!isWikiApp && (
        <>
          <HomeSummaryStrip workspaceSlug={slug} resumo={resumo} carregando={carregandoResumo} />

          <CriticalIssuesWidget workspaceSlug={slug} />

          {/* Duas colunas: à esquerda o que exige ação, à direita o contexto.
              Antes tudo dividia uma grade de três colunas iguais e a lista mais
              importante ficava do mesmo tamanho de um contador. */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="flex flex-col gap-4 xl:col-span-2">
              <OverdueWidget workspaceSlug={slug} itens={atrasados ?? []} carregando={carregandoAtrasados} />
              <MyWorkItemsWidget workspaceSlug={slug} />
              <OpenIntakesWidget workspaceSlug={slug} />
            </div>
            <div className="flex flex-col gap-4">
              <MyWorkBreakdownWidget resumo={resumo} carregando={carregandoResumo} />
              <UpcomingDatesWidget workspaceSlug={slug} />
              <DashboardQuickLinks workspaceSlug={slug} />
            </div>
          </div>
        </>
      )}

      {/* Widgets do marketplace — enviados pelo painel de widgets. */}
      {!isWikiApp && <MarketplaceWidgetsSection />}

      {/* Widgets opcionais, ligados em "Gerenciar widgets". Os fixos acima já
          cobrem o essencial, então aqui não há mais estado vazio de página
          inteira: uma home sem widget opcional continua completa. */}
      {isAnyWidgetEnabled && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {orderedWidgets.map((key) => {
            const WidgetComponent = HOME_WIDGETS_LIST[key]?.component;
            const isEnabled = widgetsMap[key]?.is_enabled;
            // "Meus chamados" e "Solicitações" já aparecem fixos acima; repetir
            // era o que deixava a home com o mesmo bloco duas vezes.
            if (!WidgetComponent || !isEnabled || WIDGETS_JA_FIXOS.includes(key)) return null;
            return <WidgetComponent key={key} workspaceSlug={slug} />;
          })}
        </div>
      )}
    </div>
  );
});
