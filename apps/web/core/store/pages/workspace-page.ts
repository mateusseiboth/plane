/**
 * Página da wiki do espaço de trabalho: a mesma `BasePage` das páginas de
 * sistema, falando com a árvore do espaço (sem projeto no caminho).
 *
 * As permissões vêm da matriz de ações (`wiki.view`, `wiki.edit`,
 * `page.manage.all`), lidas do store da wiki. A API é quem barra: aqui é só o
 * que mostrar.
 */
import { computed, makeObservable } from "mobx";
import { computedFn } from "mobx-utils";
import { EPageAccess } from "@plane/constants";
import type { TPage } from "@plane/types";
import type { RootStore } from "@/plane-web/store/root.store";
import { WorkspacePageService } from "@/services/page/workspace-page.service";
import { BasePage } from "./base-page";
import type { TPageInstance } from "./base-page";

const workspacePageService = new WorkspacePageService();

export type TWorkspacePage = TPageInstance;

export class WorkspacePage extends BasePage implements TWorkspacePage {
  constructor(store: RootStore, page: TPage) {
    const { workspaceSlug } = store.router;
    const requireIds = () => {
      if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
      return { slug: workspaceSlug, pageId: page.id };
    };
    super(store, page, {
      update: async (payload) => {
        const { slug, pageId } = requireIds();
        return await workspacePageService.update(slug, pageId, payload);
      },
      updateDescription: async (document) => {
        const { slug, pageId } = requireIds();
        await workspacePageService.updateDescription(slug, pageId, document);
      },
      updateAccess: async (payload) => {
        const { slug, pageId } = requireIds();
        await workspacePageService.updateAccess(slug, pageId, payload);
      },
      lock: async () => {
        const { slug, pageId } = requireIds();
        await workspacePageService.lock(slug, pageId);
      },
      unlock: async () => {
        const { slug, pageId } = requireIds();
        await workspacePageService.unlock(slug, pageId);
      },
      archive: async () => {
        const { slug, pageId } = requireIds();
        return await workspacePageService.archive(slug, pageId);
      },
      restore: async () => {
        const { slug, pageId } = requireIds();
        await workspacePageService.restore(slug, pageId);
      },
      duplicate: async () => {
        const { slug, pageId } = requireIds();
        return await workspacePageService.duplicate(slug, pageId);
      },
    });
    makeObservable(this, {
      canCurrentUserAccessPage: computed,
      canCurrentUserEditPage: computed,
      canCurrentUserDuplicatePage: computed,
      canCurrentUserLockPage: computed,
      canCurrentUserChangeAccess: computed,
      canCurrentUserArchivePage: computed,
      canCurrentUserDeletePage: computed,
      canCurrentUserFavoritePage: computed,
      canCurrentUserMovePage: computed,
      isContentEditable: computed,
    });
  }

  private get wiki() {
    return this.rootStore.workspacePages;
  }

  private get isPublic() {
    return this.access === EPageAccess.PUBLIC;
  }

  /** Dono, ou quem trava/arquiva/exclui páginas de outros (`page.manage.all`). */
  private get canManage() {
    return this.isCurrentUserOwner || this.wiki.canCurrentUserManageAllPages;
  }

  get canCurrentUserAccessPage() {
    return this.isPublic || this.isCurrentUserOwner;
  }

  get canCurrentUserEditPage() {
    return this.isPublic ? this.wiki.canCurrentUserEditWiki : this.isCurrentUserOwner;
  }

  get canCurrentUserDuplicatePage() {
    return this.wiki.canCurrentUserEditWiki;
  }

  get canCurrentUserLockPage() {
    return this.canManage;
  }

  get canCurrentUserChangeAccess() {
    return this.canManage;
  }

  get canCurrentUserArchivePage() {
    return this.canManage;
  }

  get canCurrentUserDeletePage() {
    return this.canManage;
  }

  get canCurrentUserFavoritePage() {
    return this.wiki.canCurrentUserViewWiki;
  }

  /** "Mover para outro sistema" não vale na wiki: a árvore tem o próprio "Mover para". */
  get canCurrentUserMovePage() {
    return false;
  }

  get isContentEditable() {
    if (this.archived_at || this.is_locked) return false;
    return this.isCurrentUserOwner || (this.isPublic && this.wiki.canCurrentUserEditWiki);
  }

  getRedirectionLink = computedFn(() => `/${this.rootStore.router.workspaceSlug}/wiki/${this.id}`);
}
