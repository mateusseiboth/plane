/**
 * Wiki do espaço de trabalho: barra com a árvore de páginas à esquerda e a
 * página aberta à direita. Quem entra é decidido pela ação `wiki.view`.
 */
import { observer } from "mobx-react";
import { Outlet } from "react-router";
import { cn } from "@plane/utils";
import { LogoSpinner } from "@/components/common/logo-spinner";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { useWikiAcoes } from "@/components/wiki/use-wiki";
import { WikiPanel } from "@/components/wiki/wiki-panel";
import type { Route } from "./+types/layout";
import { WikiHeader } from "./header";

function WikiLayout({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const pageId = (params as { pageId?: string }).pageId;
  const { canView, canEdit, isLoading } = useWikiAcoes(workspaceSlug);

  if (isLoading)
    return (
      <div className="grid size-full place-items-center">
        <LogoSpinner />
      </div>
    );

  if (!canView)
    return (
      <div className="grid size-full place-items-center px-4">
        <p className="text-center text-13 text-secondary">Sua função não dá acesso à wiki.</p>
      </div>
    );

  return (
    <>
      <AppHeader header={<WikiHeader />} />
      <ContentWrapper className="overflow-y-hidden">
        <div className="flex h-full w-full">
          <WikiPanel workspaceSlug={workspaceSlug} activePageId={pageId} canEdit={canEdit} />
          <div className={cn("relative h-full min-w-0 flex-1 flex-col", pageId ? "flex" : "hidden md:flex")}>
            <Outlet />
          </div>
        </div>
      </ContentWrapper>
    </>
  );
}

export default observer(WikiLayout);
