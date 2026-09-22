/**
 * Barra lateral da wiki: busca, árvore de páginas e as arquivadas. Com texto na
 * busca, a árvore dá lugar aos resultados (título e trecho do conteúdo).
 */
import { useState } from "react";
import { observer } from "mobx-react";
import { ChevronRight, Plus, Search } from "lucide-react";
import { Button } from "@plane/propel/button";
import { Input } from "@plane/ui";
import { cn } from "@plane/utils";
import { useWikiArchived, useWikiSearch, useWikiTree } from "./use-wiki";
import { useWikiOperations } from "./use-wiki-operations";
import { WikiArchivedList } from "./wiki-archived-list";
import { WikiSearchResults } from "./wiki-search-results";
import { WikiTree } from "./wiki-tree";

type Props = {
  workspaceSlug: string;
  activePageId: string | undefined;
  canEdit: boolean;
};

export const WikiPanel = observer(function WikiPanel(props: Props) {
  const { workspaceSlug, activePageId, canEdit } = props;
  const [busca, setBusca] = useState("");
  const [mostrarArquivadas, setMostrarArquivadas] = useState(false);
  const { data: pages, isLoading, error } = useWikiTree(workspaceSlug);
  const archived = useWikiArchived(workspaceSlug, mostrarArquivadas);
  const search = useWikiSearch(workspaceSlug, busca);
  const { createPagina } = useWikiOperations(workspaceSlug);
  const buscando = busca.trim().length > 0;

  return (
    // No celular, com uma página aberta, a barra some e o "Wiki" do cabeçalho volta para ela.
    <aside
      className={cn(
        "h-full w-full flex-shrink-0 flex-col border-r border-subtle bg-surface-1 md:flex md:w-72",
        activePageId ? "hidden" : "flex"
      )}
    >
      <div className="space-y-2 p-3">
        <div className="relative">
          <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-tertiary" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar na wiki"
            className="w-full pl-7"
          />
        </div>
        {canEdit && (
          <Button variant="secondary" className="w-full" onClick={() => void createPagina(null)}>
            <Plus className="size-3.5" />
            Nova página
          </Button>
        )}
      </div>
      <div className="vertical-scrollbar scrollbar-sm flex-1 overflow-y-auto px-2 pb-3">
        {buscando && (
          <WikiSearchResults
            workspaceSlug={workspaceSlug}
            results={search.data}
            isLoading={search.isLoading}
            activePageId={activePageId}
          />
        )}
        {!buscando && error && (
          <p className="px-2 py-3 text-13 text-danger-primary">Não foi possível carregar a wiki.</p>
        )}
        {!buscando && !error && isLoading && !pages.length && (
          <p className="px-2 py-3 text-13 text-tertiary">Carregando...</p>
        )}
        {!buscando && !isLoading && !error && !pages.length && (
          <p className="px-2 py-3 text-13 text-tertiary">Nenhuma página ainda.</p>
        )}
        {!buscando && (
          <WikiTree workspaceSlug={workspaceSlug} pages={pages} activePageId={activePageId} canEdit={canEdit} />
        )}
      </div>
      <div className="border-t border-subtle px-2 py-2">
        <button
          type="button"
          onClick={() => setMostrarArquivadas((atual) => !atual)}
          className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-13 text-secondary hover:bg-layer-transparent-hover"
        >
          <ChevronRight className={cn("size-3 transition-transform", { "rotate-90": mostrarArquivadas })} />
          Arquivadas
        </button>
        {mostrarArquivadas && (
          <div className="vertical-scrollbar scrollbar-sm max-h-48 overflow-y-auto">
            <WikiArchivedList workspaceSlug={workspaceSlug} pages={archived.data} isLoading={archived.isLoading} />
          </div>
        )}
      </div>
    </aside>
  );
});
