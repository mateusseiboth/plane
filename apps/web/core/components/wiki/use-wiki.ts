/**
 * Hooks da wiki do espaço. As telas não chamam serviço nem store direto:
 * leem daqui a árvore, as arquivadas, a busca e o que a pessoa pode fazer.
 */
import { useEffect } from "react";
import useSWR from "swr";
import type { TWikiSearchResult } from "@plane/types";
import useDebounce from "@/hooks/use-debounce";
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";
import { EPageStoreType, usePageStore } from "@/plane-web/hooks/store";

export const WIKI_STORE = EPageStoreType.WORKSPACE;

/** Espera de digitação antes de consultar a busca da wiki. */
const ESPERA_DA_BUSCA_MS = 300;

/**
 * O que a pessoa pode na wiki (`wiki.view`, `wiki.edit`, `page.manage.all`).
 * Leva as ações ao store, que as páginas consultam para decidir o que mostrar.
 */
export function useWikiAcoes(workspaceSlug: string | undefined) {
  const { setMinhasAcoes, canCurrentUserViewWiki, canCurrentUserEditWiki } = usePageStore(WIKI_STORE);
  const { data, isLoading, error } = useMyWorkspaceActions(workspaceSlug);

  // Sincroniza o store com a resposta da API; não é carga de dado.
  useEffect(() => {
    setMinhasAcoes(data?.permissions ?? []);
  }, [data, setMinhasAcoes]);

  return { canView: canCurrentUserViewWiki, canEdit: canCurrentUserEditWiki, isLoading: isLoading || !data, error };
}

/** A árvore da wiki (páginas ativas que a pessoa enxerga). */
export function useWikiTree(workspaceSlug: string | undefined, enabled = true) {
  const { fetchTree, treePages } = usePageStore(WIKI_STORE);
  const chave = workspaceSlug && enabled ? `WIKI_TREE_${workspaceSlug}` : null;
  const { error, isLoading, isValidating, mutate } = useSWR(chave, () => fetchTree(workspaceSlug as string), {
    revalidateOnFocus: true,
  });
  return { data: treePages, error, isLoading, isFetching: isValidating, refetch: mutate };
}

/** Páginas arquivadas da wiki, carregadas só quando a seção é aberta. */
export function useWikiArchived(workspaceSlug: string | undefined, enabled: boolean) {
  const { fetchArchived, archivedPages } = usePageStore(WIKI_STORE);
  const chave = workspaceSlug && enabled ? `WIKI_ARCHIVED_${workspaceSlug}` : null;
  const { error, isLoading, isValidating, mutate } = useSWR(chave, () => fetchArchived(workspaceSlug as string));
  return { data: archivedPages, error, isLoading, isFetching: isValidating, refetch: mutate };
}

/** Busca no título e no texto das páginas da wiki. */
export function useWikiSearch(workspaceSlug: string | undefined, termo: string) {
  const { service } = usePageStore(WIKI_STORE);
  const termoFinal = useDebounce(termo.trim(), ESPERA_DA_BUSCA_MS);
  const chave = workspaceSlug && termoFinal ? ["WIKI_SEARCH", workspaceSlug, termoFinal] : null;
  const { data, error, isLoading, isValidating, mutate } = useSWR<TWikiSearchResult[]>(chave, () =>
    service.search(workspaceSlug as string, termoFinal)
  );
  return {
    data: data ?? [],
    error,
    isLoading: isLoading || termo.trim() !== termoFinal,
    isFetching: isValidating,
    refetch: mutate,
  };
}
