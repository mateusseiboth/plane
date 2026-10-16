/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { computed, makeObservable } from "mobx";
import { computedFn } from "mobx-utils";
// constants
import { EPageAccess } from "@plane/constants";
import type { TPage } from "@plane/types";
// plane web store
import type { RootStore } from "@/plane-web/store/root.store";
// services
import { ProjectPageService } from "@/services/page";
const projectPageService = new ProjectPageService();
// store
import { BasePage } from "./base-page";
import type { TPageInstance } from "./base-page";
import {
  ACAO_DE_ESCREVER_PAGINA,
  ACAO_DE_GERIR_PAGINA_DE_OUTRO,
  isPageContentEditable,
  isPageEditAllowed,
  isPageManageAllowed,
} from "./regras-da-pagina";

export type TProjectPage = TPageInstance;

export class ProjectPage extends BasePage implements TProjectPage {
  constructor(store: RootStore, page: TPage) {
    // required fields for API calls
    const { workspaceSlug } = store.router;
    const projectId = page.project_ids?.[0];
    // initialize base instance
    super(store, page, {
      update: async (payload) => {
        if (!workspaceSlug || !projectId || !page.id) throw new Error("Missing required fields.");
        return await projectPageService.update(workspaceSlug, projectId, page.id, payload);
      },
      updateDescription: async (document) => {
        if (!workspaceSlug || !projectId || !page.id) throw new Error("Missing required fields.");
        await projectPageService.updateDescription(workspaceSlug, projectId, page.id, document);
      },
      updateAccess: async (payload) => {
        if (!workspaceSlug || !projectId || !page.id) throw new Error("Missing required fields.");
        await projectPageService.updateAccess(workspaceSlug, projectId, page.id, payload);
      },
      lock: async () => {
        if (!workspaceSlug || !projectId || !page.id) throw new Error("Missing required fields.");
        await projectPageService.lock(workspaceSlug, projectId, page.id);
      },
      unlock: async () => {
        if (!workspaceSlug || !projectId || !page.id) throw new Error("Missing required fields.");
        await projectPageService.unlock(workspaceSlug, projectId, page.id);
      },
      archive: async () => {
        if (!workspaceSlug || !projectId || !page.id) throw new Error("Missing required fields.");
        return await projectPageService.archive(workspaceSlug, projectId, page.id);
      },
      restore: async () => {
        if (!workspaceSlug || !projectId || !page.id) throw new Error("Missing required fields.");
        await projectPageService.restore(workspaceSlug, projectId, page.id);
      },
      duplicate: async () => {
        if (!workspaceSlug || !projectId || !page.id) throw new Error("Missing required fields.");
        return await projectPageService.duplicate(workspaceSlug, projectId, page.id);
      },
    });
    makeObservable(this, {
      // computed
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

  /** A pessoa tem a ação da matriz e participa de algum sistema a que a página pertence. */
  private canDoInAnyPageProject = computedFn((action: string): boolean => {
    const { workspaceSlug } = this.rootStore.router;
    const { permission } = this.rootStore.user;
    return (this.project_ids ?? []).some((projectId) => permission.canDoInProject(action, workspaceSlug, projectId));
  });

  /** Participa de algum sistema da página: vínculo, não permissão. */
  private isMemberOfAnyPageProject = computedFn((): boolean => {
    const workspaceSlug = this.rootStore.router.workspaceSlug ?? "";
    const { permission } = this.rootStore.user;
    return (this.project_ids ?? []).some(
      (projectId) => permission.getProjectRoleByWorkspaceSlugAndProjectId(workspaceSlug, projectId) !== undefined
    );
  });

  private get isPagePublic() {
    return this.access === EPageAccess.PUBLIC;
  }

  /** Dono, ou `page.manage.all` no espaço: o mesmo `canManage` que o api-ts confere. */
  private get canCurrentUserManagePage() {
    const canManageAll = this.rootStore.user.permission.canDo(ACAO_DE_GERIR_PAGINA_DE_OUTRO);
    return isPageManageAllowed({ isOwner: this.isCurrentUserOwner, canManageAll });
  }

  /**
   * @description returns true if the current logged in user can access the page
   */
  get canCurrentUserAccessPage() {
    return this.isPagePublic || this.isCurrentUserOwner;
  }

  /**
   * @description returns true if the current logged in user can edit the page
   */
  get canCurrentUserEditPage() {
    return isPageEditAllowed({
      isOwner: this.isCurrentUserOwner,
      isPublic: this.isPagePublic,
      canWrite: this.canDoInAnyPageProject(ACAO_DE_ESCREVER_PAGINA),
    });
  }

  /**
   * @description returns true if the current logged in user can create a duplicate the page
   */
  get canCurrentUserDuplicatePage() {
    // Duplicar cria uma página nova no sistema.
    return this.canDoInAnyPageProject(ACAO_DE_ESCREVER_PAGINA);
  }

  /**
   * @description returns true if the current logged in user can lock the page
   */
  get canCurrentUserLockPage() {
    return this.canCurrentUserManagePage;
  }

  /**
   * @description returns true if the current logged in user can change the access of the page
   */
  get canCurrentUserChangeAccess() {
    return this.canCurrentUserManagePage;
  }

  /**
   * @description returns true if the current logged in user can archive the page
   */
  get canCurrentUserArchivePage() {
    return this.canCurrentUserManagePage;
  }

  /**
   * @description returns true if the current logged in user can delete the page
   */
  get canCurrentUserDeletePage() {
    return this.canCurrentUserManagePage;
  }

  /**
   * @description returns true if the current logged in user can favorite the page
   */
  get canCurrentUserFavoritePage() {
    // Favoritar é preferência pessoal: basta participar do sistema (o api-ts só exige leitura).
    return this.isMemberOfAnyPageProject();
  }

  /**
   * @description returns true if the current logged in user can move the page
   */
  get canCurrentUserMovePage() {
    return this.canCurrentUserManagePage;
  }

  /**
   * @description returns true if the page can be edited
   */
  get isContentEditable() {
    return isPageContentEditable({
      isArchived: !!this.archived_at,
      isLocked: !!this.is_locked,
      isOwner: this.isCurrentUserOwner,
      isPublic: this.isPagePublic,
      canWrite: this.canDoInAnyPageProject(ACAO_DE_ESCREVER_PAGINA),
    });
  }

  getRedirectionLink = computedFn(() => {
    const { workspaceSlug } = this.rootStore.router;
    return `/${workspaceSlug}/projects/${this.project_ids?.[0]}/pages/${this.id}`;
  });
}
