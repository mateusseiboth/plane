/**
 * Operações da árvore da wiki: criar página (na raiz ou como filha), mover para
 * outra mãe, subir/descer entre as irmãs, arquivar e restaurar. A posição
 * (`sort_order`) é calculada por `getSortOrderBetween` de `@plane/utils`.
 */
import { useCallback, useMemo } from "react";
import { EPageAccess } from "@plane/constants";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { getSortOrderBetween } from "@plane/utils";
import { useAppRouter } from "@/hooks/use-app-router";
import { usePageStore } from "@/plane-web/hooks/store";
import type { TWorkspacePage } from "@/store/pages/workspace-page";
import { WIKI_STORE } from "./use-wiki";

export type TWikiDirecao = "up" | "down";

const bySortOrder = (a: TWorkspacePage, b: TWorkspacePage) => (a.sort_order ?? 0) - (b.sort_order ?? 0);

/** Nova posição para subir ou descer uma casa entre as irmãs (já ordenadas). */
const POSICAO_POR_DIRECAO: Record<TWikiDirecao, (irmas: TWorkspacePage[], indice: number) => number | undefined> = {
  up: (irmas, indice) =>
    indice < 1 ? undefined : getSortOrderBetween(irmas[indice - 2]?.sort_order, irmas[indice - 1]?.sort_order),
  down: (irmas, indice) =>
    indice < 0 || indice >= irmas.length - 1
      ? undefined
      : getSortOrderBetween(irmas[indice + 1]?.sort_order, irmas[indice + 2]?.sort_order),
};

const showErro = (message: string) => setToast({ type: TOAST_TYPE.ERROR, title: "Erro!", message });

export function useWikiOperations(workspaceSlug: string) {
  const router = useAppRouter();
  const { createPage, movePageInTree, fetchTree, fetchArchived, treePages } = usePageStore(WIKI_STORE);

  const getIrmas = useCallback(
    (parentId: string | null) => treePages.filter((page) => (page.parent_id ?? null) === parentId).sort(bySortOrder),
    [treePages]
  );

  const createPagina = useCallback(
    async (parentId: string | null) => {
      try {
        const page = await createPage({ parent_id: parentId, access: EPageAccess.PUBLIC });
        if (page?.id) router.push(`/${workspaceSlug}/wiki/${page.id}`);
      } catch {
        showErro("Não foi possível criar a página. Tente novamente.");
      }
    },
    [createPage, router, workspaceSlug]
  );

  /** Vai para o fim das filhas da nova mãe (`null` é a raiz da wiki). */
  const movePagina = useCallback(
    async (pageId: string, parentId: string | null) => {
      const ultima = getIrmas(parentId)
        .filter((page) => page.id !== pageId)
        .at(-1);
      try {
        await movePageInTree(pageId, {
          parent_id: parentId,
          sort_order: getSortOrderBetween(ultima?.sort_order, undefined),
        });
      } catch {
        showErro("Não foi possível mover a página. Tente novamente.");
      }
    },
    [getIrmas, movePageInTree]
  );

  const reorderPagina = useCallback(
    async (page: TWorkspacePage, direcao: TWikiDirecao) => {
      if (!page.id) return;
      const irmas = getIrmas(page.parent_id ?? null);
      const sortOrder = POSICAO_POR_DIRECAO[direcao](
        irmas,
        irmas.findIndex((irma) => irma.id === page.id)
      );
      if (sortOrder === undefined) return;
      try {
        await movePageInTree(page.id, { parent_id: page.parent_id ?? null, sort_order: sortOrder });
      } catch {
        showErro("Não foi possível reordenar a página. Tente novamente.");
      }
    },
    [getIrmas, movePageInTree]
  );

  /** Arquivar leva as filhas junto (a API arquiva a subárvore); a árvore é recarregada. */
  const archivePagina = useCallback(
    async (page: TWorkspacePage) => {
      await page.archive({});
      await fetchTree(workspaceSlug).catch(() => undefined);
    },
    [fetchTree, workspaceSlug]
  );

  const restorePagina = useCallback(
    async (page: TWorkspacePage) => {
      try {
        await page.restore({});
        await Promise.all([fetchTree(workspaceSlug), fetchArchived(workspaceSlug)]);
      } catch {
        showErro("Não foi possível restaurar a página. Tente novamente.");
      }
    },
    [fetchArchived, fetchTree, workspaceSlug]
  );

  const canReorder = useCallback(
    (page: TWorkspacePage, direcao: TWikiDirecao) => {
      const irmas = getIrmas(page.parent_id ?? null);
      return (
        POSICAO_POR_DIRECAO[direcao](
          irmas,
          irmas.findIndex((irma) => irma.id === page.id)
        ) !== undefined
      );
    },
    [getIrmas]
  );

  return useMemo(
    () => ({ createPagina, movePagina, reorderPagina, archivePagina, restorePagina, canReorder }),
    [createPagina, movePagina, reorderPagina, archivePagina, restorePagina, canReorder]
  );
}
