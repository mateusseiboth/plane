/**
 * Páginas arquivadas da wiki: restaurar (volta com as filhas) e excluir de vez
 * (a exclusão só é oferecida para página arquivada, como nas páginas de sistema).
 */
import { useState } from "react";
import { observer } from "mobx-react";
import { ArchiveRestoreIcon } from "lucide-react";
import { PageIcon, TrashIcon } from "@plane/propel/icons";
import { getPageName } from "@plane/utils";
import { DeletePageModal } from "@/components/pages/modals/delete-page-modal";
import type { TWorkspacePage } from "@/store/pages/workspace-page";
import { useWikiOperations } from "./use-wiki-operations";
import { WIKI_STORE } from "./use-wiki";

type Props = {
  workspaceSlug: string;
  pages: TWorkspacePage[];
  isLoading: boolean;
};

export const WikiArchivedList = observer(function WikiArchivedList(props: Props) {
  const { workspaceSlug, pages, isLoading } = props;
  const [excluindo, setExcluindo] = useState<TWorkspacePage | undefined>(undefined);
  const { restorePagina } = useWikiOperations(workspaceSlug);

  if (isLoading && !pages.length) return <p className="px-2 py-2 text-13 text-tertiary">Carregando...</p>;
  if (!pages.length) return <p className="px-2 py-2 text-13 text-tertiary">Nenhuma página arquivada.</p>;

  return (
    <>
      <ul className="space-y-0.5">
        {pages.map((page) => (
          <li key={page.id} className="group flex items-center gap-1.5 rounded-md px-2 py-1 text-13 text-tertiary">
            <PageIcon className="size-3.5 flex-shrink-0" />
            <span className="min-w-0 flex-1 truncate">{getPageName(page.name)}</span>
            {page.canCurrentUserArchivePage && (
              <button
                type="button"
                aria-label="Restaurar"
                title="Restaurar"
                onClick={() => void restorePagina(page)}
                className="hidden size-5 place-items-center rounded-sm group-hover:grid hover:bg-layer-1"
              >
                <ArchiveRestoreIcon className="size-3.5" />
              </button>
            )}
            {page.canCurrentUserDeletePage && (
              <button
                type="button"
                aria-label="Excluir"
                title="Excluir"
                onClick={() => setExcluindo(page)}
                className="hidden size-5 place-items-center rounded-sm text-danger-primary group-hover:grid hover:bg-layer-1"
              >
                <TrashIcon className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {excluindo && (
        <DeletePageModal
          isOpen={!!excluindo}
          onClose={() => setExcluindo(undefined)}
          page={excluindo}
          storeType={WIKI_STORE}
        />
      )}
    </>
  );
});
