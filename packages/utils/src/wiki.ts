/**
 * Wiki do espaço de trabalho: regras puras da árvore de páginas.
 *
 * A API devolve a wiki inteira numa lista simples (`parent_id`, `sort_order`).
 * A hierarquia é montada aqui, uma vez, e toda tela (barra lateral, "mover
 * para", trilha de navegação) lê daqui, em vez de cada uma percorrer a lista.
 */

/** O mínimo de uma página que a árvore precisa. */
export type TWikiTreePage = {
  id?: string | undefined;
  parent_id?: string | null;
  sort_order?: number;
};

export type TWikiTreeNode<T extends TWikiTreePage> = {
  page: T;
  children: TWikiTreeNode<T>[];
};

/** Posição de quem entra sem vizinhas, e o passo para antes/depois de uma ponta. */
const SORT_ORDER_INICIAL = 65_535;
const SORT_ORDER_PASSO = 10_000;

const bySortOrder = <T extends TWikiTreePage>(a: TWikiTreeNode<T>, b: TWikiTreeNode<T>) =>
  (a.page.sort_order ?? 0) - (b.page.sort_order ?? 0);

/** A mãe é da lista e não leva a um ciclo (subindo pela mãe, a página não reaparece). */
const hasMaeValida = <T extends TWikiTreePage>(page: T, porId: Map<string, T>): boolean => {
  const visitadas = new Set<string | undefined>([page.id]);
  let atual = page.parent_id ? porId.get(page.parent_id) : undefined;
  while (atual) {
    if (visitadas.has(atual.id)) return false;
    visitadas.add(atual.id);
    atual = atual.parent_id ? porId.get(atual.parent_id) : undefined;
  }
  return !!page.parent_id && porId.has(page.parent_id);
};

/**
 * Monta a árvore. Página cuja mãe não veio na lista (arquivada, privada de
 * outra pessoa) ou que está num ciclo sobe para a raiz: some da tela é pior.
 */
export function buildWikiTree<T extends TWikiTreePage>(todas: T[]): TWikiTreeNode<T>[] {
  const pages = todas.filter((page) => !!page.id);
  const porId = new Map(pages.map((page) => [page.id as string, page]));
  const nos = new Map(pages.map((page) => [page.id as string, { page, children: [] as TWikiTreeNode<T>[] }]));
  const raiz: TWikiTreeNode<T>[] = [];

  for (const page of pages) {
    const no = nos.get(page.id as string)!;
    const mae = hasMaeValida(page, porId) ? nos.get(page.parent_id!) : undefined;
    (mae ? mae.children : raiz).push(no);
  }

  const sortRecursivo = (lista: TWikiTreeNode<T>[]): TWikiTreeNode<T>[] => {
    lista.sort(bySortOrder);
    lista.forEach((no) => sortRecursivo(no.children));
    return lista;
  };
  return sortRecursivo(raiz);
}

/** `sort_order` para ficar entre duas vizinhas (qualquer uma pode faltar). */
export function getSortOrderBetween(antes: number | undefined, depois: number | undefined): number {
  if (antes !== undefined && depois !== undefined) return (antes + depois) / 2;
  if (antes !== undefined) return antes + SORT_ORDER_PASSO;
  if (depois !== undefined) return depois - SORT_ORDER_PASSO;
  return SORT_ORDER_INICIAL;
}

/** Ids da página e de todas as descendentes dela na lista. */
const getSubarvoreIds = <T extends TWikiTreePage>(pages: T[], pageId: string): Set<string | undefined> => {
  const ids = new Set<string | undefined>([pageId]);
  let cresceu = true;
  while (cresceu) {
    cresceu = false;
    for (const page of pages) {
      if (page.parent_id && ids.has(page.parent_id) && !ids.has(page.id)) {
        ids.add(page.id);
        cresceu = true;
      }
    }
  }
  return ids;
};

/** Destinos válidos de "mover para": tudo menos a própria página e a descendência. */
export function getWikiMoveTargets<T extends TWikiTreePage>(pages: T[], pageId: string): T[] {
  const bloqueadas = getSubarvoreIds(pages, pageId);
  return pages.filter((page) => !bloqueadas.has(page.id));
}

/** Ancestrais da página, do topo até a mãe direta (a trilha de navegação). */
export function getWikiPageAncestors<T extends TWikiTreePage>(pages: T[], pageId: string): T[] {
  const porId = new Map(pages.map((page) => [page.id, page]));
  const ancestrais: T[] = [];
  const visitadas = new Set<string | undefined>([pageId]);
  let mae = porId.get(pageId)?.parent_id ? porId.get(porId.get(pageId)!.parent_id!) : undefined;
  while (mae && !visitadas.has(mae.id)) {
    ancestrais.unshift(mae);
    visitadas.add(mae.id);
    mae = mae.parent_id ? porId.get(mae.parent_id) : undefined;
  }
  return ancestrais;
}

/**
 * Endereço de uma página na tela: a de sistema abre no sistema (o atual,
 * quando ela está nele); a sem sistema é da wiki.
 */
export function getPaginaPath(args: {
  workspaceSlug: string;
  pageId: string;
  projectIds?: string[] | null;
  currentProjectId?: string | null;
}): string {
  const { workspaceSlug, pageId, projectIds, currentProjectId } = args;
  const sistemas = projectIds ?? [];
  const sistema = currentProjectId && sistemas.includes(currentProjectId) ? currentProjectId : sistemas[0];
  if (!sistema) return `/${workspaceSlug}/wiki/${pageId}`;
  return `/${workspaceSlug}/projects/${sistema}/pages/${pageId}`;
}
