/**
 * Cabeçalho da wiki: trilha "Wiki / mães / página" e, com uma página aberta,
 * as mesmas ações das páginas de sistema (travar, favoritar, histórico...).
 */
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { BookOpen } from "lucide-react";
import { PageIcon } from "@plane/propel/icons";
import { Breadcrumbs, Header } from "@plane/ui";
import { getPageName, getWikiPageAncestors } from "@plane/utils";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { PageHeaderActions } from "@/components/pages/header/actions";
import { PageSyncingBadge } from "@/components/pages/header/syncing-badge";
import { WIKI_STORE } from "@/components/wiki/use-wiki";
import { usePageStore } from "@/plane-web/hooks/store";

export const WikiHeader = observer(function WikiHeader() {
  const { workspaceSlug, pageId } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { treePages, getPageById } = usePageStore(WIKI_STORE);
  // `usePage` exige id; no início da wiki não há página aberta.
  const page = pageId ? getPageById(pageId.toString()) : undefined;
  const ancestrais = page?.id ? getWikiPageAncestors(treePages, page.id) : [];

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs>
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                label="Wiki"
                href={`/${slug}/wiki`}
                icon={<BookOpen className="size-4 text-tertiary" />}
              />
            }
          />
          {ancestrais.map((mae) => (
            <Breadcrumbs.Item
              key={mae.id}
              component={
                <BreadcrumbLink
                  label={getPageName(mae.name)}
                  href={`/${slug}/wiki/${mae.id}`}
                  icon={<PageIcon className="size-4 text-tertiary" />}
                />
              }
            />
          ))}
          {page && (
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink
                  label={getPageName(page.name)}
                  icon={<PageIcon className="size-4 text-tertiary" />}
                  isLast
                />
              }
            />
          )}
        </Breadcrumbs>
      </Header.LeftItem>
      {page && (
        <Header.RightItem>
          <PageSyncingBadge syncStatus={page.isSyncingWithServer} />
          <PageHeaderActions page={page} storeType={WIKI_STORE} />
        </Header.RightItem>
      )}
    </Header>
  );
});
