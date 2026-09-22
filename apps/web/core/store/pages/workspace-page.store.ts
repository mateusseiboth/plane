/**
 * Store da wiki do espaço de trabalho (páginas sem sistema).
 *
 * Segue o contrato do store de páginas de sistema (`IProjectPageStore`) porque
 * os componentes do editor (cabeçalho, excluir, eventos em tempo real) recebem
 * o tipo de store e chamam os mesmos métodos. Onde o contrato pede `projectId`,
 * a wiki ignora: o escopo é o espaço inteiro.
 *
 * O que só a wiki tem: a árvore (`fetchTree`, `treePages`), mover/reordenar
 * (`movePageInTree`) e as ações da pessoa no espaço (`setMinhasAcoes`), que
 * decidem o que a tela oferece. Quem barra de verdade é a API.
 */
import { set, unset } from "lodash-es";
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
import type { TPage, TPageFilters, TPageNavigationTabs } from "@plane/types";
import { filterPagesByPageType, getPageName, orderPages, shouldFilterPage } from "@plane/utils";
import type { RootStore } from "@/plane-web/store/root.store";
import { WorkspacePageService } from "@/services/page/workspace-page.service";
import type { IProjectPageStore } from "./project-page.store";
import type { TWorkspacePage } from "./workspace-page";
import { WorkspacePage } from "./workspace-page";

/** Chaves das ações da matriz que a wiki consulta (iguais às do catálogo da API). */
export const WIKI_ACTIONS = {
  VIEW: "wiki.view",
  EDIT: "wiki.edit",
  MANAGE_ALL: "page.manage.all",
} as const;

type TLoader = "init-loader" | "mutation-loader" | undefined;

export interface IWorkspacePageStore extends IProjectPageStore {
  service: WorkspacePageService;
  minhasAcoes: string[];
  canCurrentUserViewWiki: boolean;
  canCurrentUserEditWiki: boolean;
  canCurrentUserManageAllPages: boolean;
  treePages: TWorkspacePage[];
  archivedPages: TWorkspacePage[];
  setMinhasAcoes: (acoes: string[]) => void;
  fetchTree: (workspaceSlug: string) => Promise<TPage[] | undefined>;
  fetchArchived: (workspaceSlug: string) => Promise<TPage[] | undefined>;
  movePageInTree: (pageId: string, posicao: { parent_id: string | null; sort_order: number }) => Promise<void>;
}

const ERRO_DA_LISTA = { title: "Falhou", description: "Não foi possível carregar a wiki. Tente novamente." };
const ERRO_DA_PAGINA = { title: "Falhou", description: "Não foi possível carregar a página. Tente novamente." };
const ERRO_AO_CRIAR = { title: "Falhou", description: "Não foi possível criar a página. Tente novamente." };
const ERRO_AO_EXCLUIR = { title: "Falhou", description: "Não foi possível excluir a página. Tente novamente." };

export class WorkspacePageStore implements IWorkspacePageStore {
  loader: TLoader = "init-loader";
  data: Record<string, TWorkspacePage> = {};
  error: { title: string; description: string } | undefined = undefined;
  filters: TPageFilters = { searchQuery: "", sortKey: "updated_at", sortBy: "desc" };
  minhasAcoes: string[] = [];
  service = new WorkspacePageService();

  constructor(private store: RootStore) {
    makeObservable(this, {
      loader: observable.ref,
      data: observable,
      error: observable,
      filters: observable,
      minhasAcoes: observable.ref,
      isAnyPageAvailable: computed,
      canCurrentUserCreatePage: computed,
      canCurrentUserViewWiki: computed,
      canCurrentUserEditWiki: computed,
      canCurrentUserManageAllPages: computed,
      treePages: computed,
      archivedPages: computed,
      setMinhasAcoes: action,
      updateFilters: action,
      clearAllFilters: action,
      fetchPagesList: action,
      fetchTree: action,
      fetchArchived: action,
      fetchPageDetails: action,
      createPage: action,
      removePage: action,
      movePage: action,
      movePageInTree: action,
    });
  }

  // ── permissões (o que mostrar) ────────────────────────────────────────────

  setMinhasAcoes = (acoes: string[]) => {
    this.minhasAcoes = acoes;
  };

  get canCurrentUserViewWiki() {
    return this.minhasAcoes.includes(WIKI_ACTIONS.VIEW);
  }

  get canCurrentUserEditWiki() {
    return this.minhasAcoes.includes(WIKI_ACTIONS.EDIT);
  }

  get canCurrentUserManageAllPages() {
    return this.minhasAcoes.includes(WIKI_ACTIONS.MANAGE_ALL);
  }

  get canCurrentUserCreatePage() {
    return this.canCurrentUserEditWiki;
  }

  // ── leitura ───────────────────────────────────────────────────────────────

  get isAnyPageAvailable() {
    if (this.loader) return true;
    return Object.keys(this.data).length > 0;
  }

  /** Páginas ativas da wiki: a barra lateral monta a árvore com `buildWikiTree`. */
  get treePages() {
    return Object.values(this.data).filter((page) => !page.archived_at && !page.deleted_at);
  }

  get archivedPages() {
    return Object.values(this.data).filter((page) => !!page.archived_at && !page.deleted_at);
  }

  getPageById = computedFn((pageId: string) => this.data?.[pageId] || undefined);

  getCurrentProjectPageIdsByTab = computedFn((pageType: TPageNavigationTabs) =>
    filterPagesByPageType(pageType, Object.values(this.data)).map((page) => page.id as string)
  );

  getCurrentProjectPageIds = computedFn((_projectId: string) => Object.keys(this.data));

  getCurrentProjectFilteredPageIdsByTab = computedFn((pageType: TPageNavigationTabs) => {
    const busca = this.filters.searchQuery.toLowerCase();
    const filtradas = filterPagesByPageType(pageType, Object.values(this.data)).filter(
      (page) => getPageName(page.name).toLowerCase().includes(busca) && shouldFilterPage(page, this.filters.filters)
    );
    return orderPages(filtradas, this.filters.sortKey, this.filters.sortBy).map((page) => page.id as string);
  });

  updateFilters = <T extends keyof TPageFilters>(filterKey: T, filterValue: TPageFilters[T]) => {
    runInAction(() => set(this.filters, [filterKey], filterValue));
  };

  clearAllFilters = () => runInAction(() => set(this.filters, ["filters"], {}));

  /** Grava a página no store: atualiza a instância existente ou cria uma nova. */
  private upsertPage = (page: TPage, shouldUpdateName = true) => {
    if (!page?.id) return;
    const existente = this.getPageById(page.id);
    if (existente) {
      existente.mutateProperties(page, shouldUpdateName);
      return;
    }
    set(this.data, [page.id], new WorkspacePage(this.store, page));
  };

  private async load<T>(call: () => Promise<T>, erro: { title: string; description: string }) {
    runInAction(() => {
      this.loader = Object.keys(this.data).length ? "mutation-loader" : "init-loader";
      this.error = undefined;
    });
    try {
      return await call();
    } catch (error) {
      runInAction(() => {
        this.error = erro;
      });
      throw error;
    } finally {
      runInAction(() => {
        this.loader = undefined;
      });
    }
  }

  fetchTree = async (workspaceSlug: string) => {
    if (!workspaceSlug) return undefined;
    return this.load(async () => {
      const pages = await this.service.fetchTree(workspaceSlug);
      runInAction(() => {
        // Ativa que não veio mais foi arquivada junto com a mãe, excluída ou
        // ficou privada: sai da árvore.
        const ativas = new Set(pages.map((page) => page.id));
        this.treePages
          .filter((page) => page.id && !ativas.has(page.id))
          .forEach((page) => unset(this.data, [page.id as string]));
        // O nome não é sobrescrito: quem está digitando o título não perde o texto.
        pages.forEach((page) => this.upsertPage(page, false));
      });
      return pages;
    }, ERRO_DA_LISTA);
  };

  fetchArchived = async (workspaceSlug: string) => {
    if (!workspaceSlug) return undefined;
    return this.load(async () => {
      const pages = await this.service.fetchArchived(workspaceSlug);
      runInAction(() => pages.forEach((page) => this.upsertPage(page, false)));
      return pages;
    }, ERRO_DA_LISTA);
  };

  /** Contrato do store de páginas: na wiki, "a lista" é a árvore inteira. */
  fetchPagesList = async (workspaceSlug: string, _projectId?: string, pageType?: TPageNavigationTabs) =>
    pageType === "archived" ? this.fetchArchived(workspaceSlug) : this.fetchTree(workspaceSlug);

  fetchPageDetails = async (workspaceSlug: string, _projectId: string, pageId: string) => {
    if (!workspaceSlug || !pageId) return undefined;
    return this.load(async () => {
      const page = await this.service.fetchById(workspaceSlug, pageId);
      runInAction(() => this.upsertPage(page));
      return page;
    }, ERRO_DA_PAGINA);
  };

  createPage = async (pageData: Partial<TPage>) => {
    const { workspaceSlug } = this.store.router;
    if (!workspaceSlug) return undefined;
    return this.load(async () => {
      const page = await this.service.create(workspaceSlug, pageData);
      runInAction(() => this.upsertPage(page));
      return page;
    }, ERRO_AO_CRIAR);
  };

  /**
   * Excluir solta as filhas (a API as sobe para a raiz): o store faz o mesmo
   * para a árvore não esconder as filhas até a próxima recarga.
   */
  removePage = async ({ pageId, shouldSync = true }: { pageId: string; shouldSync?: boolean }) => {
    const { workspaceSlug } = this.store.router;
    if (!workspaceSlug || !pageId) return undefined;
    try {
      if (shouldSync) await this.service.remove(workspaceSlug, pageId);
      runInAction(() => {
        Object.values(this.data)
          .filter((page) => page.parent_id === pageId)
          .forEach((page) => page.mutateProperties({ parent_id: null }));
        unset(this.data, [pageId]);
        if (this.store.favorite.entityMap[pageId]) this.store.favorite.removeFavoriteFromStore(pageId);
      });
    } catch (error) {
      runInAction(() => {
        this.error = ERRO_AO_EXCLUIR;
      });
      throw error;
    }
  };

  /** "Mover para outro sistema" não se aplica à wiki (ver `WorkspacePage.canCurrentUserMovePage`). */
  movePage = async () => undefined;

  /**
   * Mover na árvore (outra mãe) e reordenar (outra posição entre as irmãs). A
   * tela muda na hora; se a API recusar, a posição anterior volta.
   */
  movePageInTree = async (pageId: string, posicao: { parent_id: string | null; sort_order: number }) => {
    const { workspaceSlug } = this.store.router;
    const page = this.getPageById(pageId);
    if (!page || !workspaceSlug) return;
    const anterior = { parent_id: page.parent_id ?? null, sort_order: page.sort_order ?? 0 };
    page.mutateProperties(posicao);
    try {
      // Só a posição vai no PATCH: `BasePage.update` manda a página inteira.
      await this.service.update(workspaceSlug, pageId, posicao);
    } catch (error) {
      runInAction(() => page.mutateProperties(anterior));
      throw error;
    }
  };
}
