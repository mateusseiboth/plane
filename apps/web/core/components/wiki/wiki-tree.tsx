/**
 * Árvore da wiki: monta a hierarquia com `buildWikiTree` (fonte única) e mantém
 * abertas as mães da página aberta, para ela sempre aparecer na barra.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { buildWikiTree, getWikiPageAncestors } from "@plane/utils";
import type { TWorkspacePage } from "@/store/pages/workspace-page";
import { useWikiOperations } from "./use-wiki-operations";
import { WikiMoveModal } from "./wiki-move-modal";
import { WikiTreeItem } from "./wiki-tree-item";
import type { TWikiTreeItemHandlers } from "./wiki-tree-item";

type Props = {
  workspaceSlug: string;
  pages: TWorkspacePage[];
  activePageId: string | undefined;
  canEdit: boolean;
};

export const WikiTree = observer(function WikiTree(props: Props) {
  const { workspaceSlug, pages, activePageId, canEdit } = props;
  const [expandidas, setExpandidas] = useState<ReadonlySet<string>>(new Set());
  const [movendo, setMovendo] = useState<TWorkspacePage | undefined>(undefined);
  const operations = useWikiOperations(workspaceSlug);

  const arvore = buildWikiTree(pages);
  const ancestraisDaAtiva = useMemo(
    () => (activePageId ? getWikiPageAncestors(pages, activePageId).map((page) => page.id as string) : []),
    [activePageId, pages]
  );

  // Abrir uma página pela busca ou por link deve revelar onde ela está.
  useEffect(() => {
    if (!ancestraisDaAtiva.length) return;
    setExpandidas((atuais) => new Set([...atuais, ...ancestraisDaAtiva]));
  }, [ancestraisDaAtiva]);

  const expand = useCallback((pageId: string) => setExpandidas((atuais) => new Set([...atuais, pageId])), []);

  const handlers: TWikiTreeItemHandlers = useMemo(
    () => ({
      onToggle: (pageId) =>
        setExpandidas((atuais) => {
          const proximas = new Set(atuais);
          if (!proximas.delete(pageId)) proximas.add(pageId);
          return proximas;
        }),
      onCreateChild: (parentId) => {
        expand(parentId);
        void operations.createPagina(parentId);
      },
      onMove: setMovendo,
      onReorder: (page, direcao) => void operations.reorderPagina(page, direcao),
      onArchive: (page) => void operations.archivePagina(page),
      canReorder: operations.canReorder,
    }),
    [expand, operations]
  );

  const handleMove = async (pageId: string, parentId: string | null) => {
    if (parentId) expand(parentId);
    await operations.movePagina(pageId, parentId);
  };

  return (
    <>
      <ul className="space-y-0.5">
        {arvore.map((node) => (
          <WikiTreeItem
            key={node.page.id}
            node={node}
            depth={0}
            workspaceSlug={workspaceSlug}
            activePageId={activePageId}
            expandidas={expandidas}
            canEdit={canEdit}
            handlers={handlers}
          />
        ))}
      </ul>
      <WikiMoveModal page={movendo} pages={pages} onClose={() => setMovendo(undefined)} onMove={handleMove} />
    </>
  );
});
