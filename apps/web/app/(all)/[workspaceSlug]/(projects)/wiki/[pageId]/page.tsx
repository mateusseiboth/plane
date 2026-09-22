/**
 * Página da wiki aberta no editor. É o mesmo `PageRoot` das páginas de
 * sistema (editor colaborativo, histórico de versões, anexos), falando com a
 * árvore do espaço: o `live` recebe `documentType: "workspace_page"`.
 */
import { useCallback, useEffect, useMemo } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import useSWR from "swr";
import { getButtonStyling } from "@plane/propel/button";
import type { TSearchEntityRequestPayload, TWebhookConnectionQueryParams } from "@plane/types";
import { EFileAssetType } from "@plane/types";
import { cn } from "@plane/utils";
import { LogoSpinner } from "@/components/common/logo-spinner";
import { PageHead } from "@/components/core/page-title";
import type { TPageRootConfig, TPageRootHandlers } from "@/components/pages/editor/page-root";
import { PageRoot } from "@/components/pages/editor/page-root";
import { WIKI_STORE } from "@/components/wiki/use-wiki";
import { useEditorConfig } from "@/hooks/editor";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useAppRouter } from "@/hooks/use-app-router";
import { usePage, usePageStore } from "@/plane-web/hooks/store";
import { WorkspacePageService } from "@/services/page/workspace-page.service";
import { WorkspaceService } from "@/services/workspace.service";
import type { Route } from "./+types/page";

const workspaceService = new WorkspaceService();
const workspacePageService = new WorkspacePageService();

function WikiPageDetails({ params }: Route.ComponentProps) {
  const router = useAppRouter();
  const { workspaceSlug, pageId } = params;
  const { createPage, fetchPageDetails } = usePageStore(WIKI_STORE);
  const page = usePage({ pageId, storeType: WIKI_STORE });
  const { getWorkspaceBySlug } = useWorkspace();
  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();
  const { getEditorFileHandlers } = useEditorConfig();
  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id ?? "";
  const { canCurrentUserAccessPage, id, name, updateDescription } = page ?? {};

  const { error: pageDetailsError } = useSWR(
    `WIKI_PAGE_DETAILS_${pageId}`,
    () => fetchPageDetails(workspaceSlug, "", pageId),
    { revalidateIfStale: true, revalidateOnFocus: true, revalidateOnReconnect: true }
  );

  const fetchEntityCallback = useCallback(
    async (payload: TSearchEntityRequestPayload) => await workspaceService.searchEntity(workspaceSlug, payload),
    [workspaceSlug]
  );

  const pageRootHandlers: TPageRootHandlers = useMemo(
    () => ({
      create: createPage,
      fetchAllVersions: async (versionPageId) =>
        await workspacePageService.fetchAllVersions(workspaceSlug, versionPageId),
      fetchDescriptionBinary: async () => await workspacePageService.fetchDescriptionBinary(workspaceSlug, pageId),
      fetchEntity: fetchEntityCallback,
      fetchVersionDetails: async (versionPageId, versionId) =>
        await workspacePageService.fetchVersionById(workspaceSlug, versionPageId, versionId),
      // A restauração troca o conteúdo no próprio editor (`PageRoot`), que o
      // `live` grava; não há rota de restauração na API.
      restoreVersion: async () => undefined,
      getRedirectionLink: (redirectPageId) =>
        redirectPageId ? `/${workspaceSlug}/wiki/${redirectPageId}` : `/${workspaceSlug}/wiki`,
      updateDescription: updateDescription ?? (async () => {}),
    }),
    [createPage, fetchEntityCallback, pageId, updateDescription, workspaceSlug]
  );

  const pageRootConfig: TPageRootConfig = useMemo(
    () => ({
      fileHandler: getEditorFileHandlers({
        uploadFile: async (blockId, file) => {
          const { asset_id } = await uploadEditorAsset({
            blockId,
            data: { entity_identifier: id ?? "", entity_type: EFileAssetType.PAGE_DESCRIPTION },
            file,
            workspaceSlug,
          });
          return asset_id;
        },
        duplicateFile: async (assetId: string) => {
          const { asset_id } = await duplicateEditorAsset({
            assetId,
            entityId: id,
            entityType: EFileAssetType.PAGE_DESCRIPTION,
            workspaceSlug,
          });
          return asset_id;
        },
        workspaceId,
        workspaceSlug,
      }),
    }),
    [getEditorFileHandlers, workspaceId, workspaceSlug, uploadEditorAsset, id, duplicateEditorAsset]
  );

  const webhookConnectionParams: TWebhookConnectionQueryParams = useMemo(
    () => ({ documentType: "workspace_page", workspaceSlug }),
    [workspaceSlug]
  );

  // Página excluída (aqui ou em outra aba, pelo tempo real) volta para o início da wiki.
  useEffect(() => {
    if (page?.deleted_at && page?.id) router.push(pageRootHandlers.getRedirectionLink());
  }, [page?.deleted_at, page?.id, router, pageRootHandlers]);

  if ((!page || !id) && !pageDetailsError)
    return (
      <div className="grid size-full place-items-center">
        <LogoSpinner />
      </div>
    );

  if (pageDetailsError || !canCurrentUserAccessPage || !page)
    return (
      <div className="flex h-full w-full flex-col items-center justify-center px-4">
        <h3 className="text-center text-16 font-semibold">Página não encontrada</h3>
        <p className="mt-3 text-center text-13 text-secondary">A página não existe ou você não tem acesso a ela.</p>
        <Link href={`/${workspaceSlug}/wiki`} className={cn(getButtonStyling("secondary", "base"), "mt-5")}>
          Voltar para a wiki
        </Link>
      </div>
    );

  return (
    <>
      <PageHead title={name} />
      <div className="relative flex h-full w-full flex-shrink-0 flex-col overflow-hidden">
        <PageRoot
          config={pageRootConfig}
          handlers={pageRootHandlers}
          storeType={WIKI_STORE}
          page={page}
          webhookConnectionParams={webhookConnectionParams}
          workspaceSlug={workspaceSlug}
        />
      </div>
    </>
  );
}

export default observer(WikiPageDetails);
