/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { unset, set } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// plane imports
import type { TUserPermissions } from "@plane/constants";
import { EUserPermissions, WORKSPACE_SIDEBAR_DYNAMIC_NAVIGATION_ITEMS_LINKS } from "@plane/constants";
import type { IUserProjectsRole, IWorkspaceMemberMe, TProjectMembership } from "@plane/types";
import { EUserWorkspaceRoles } from "@plane/types";
// plane web imports
import { WorkspaceService } from "@/services/workspace.service";
import type { RootStore } from "@/plane-web/store/root.store";
import { isActionAllowed, isRequiredActionAllowed } from "@/lib/permissoes/acao-efetiva";
import type { TRequiredAction } from "@/lib/permissoes/acao-efetiva";
// services
import projectMemberService from "@/services/project/project-member.service";
import rolesService from "@/services/roles.service";
import type { TMyActions } from "@/services/roles.service";
import userService from "@/services/user.service";

// derived services
const workspaceService = new WorkspaceService();

export interface IBaseUserPermissionStore {
  loader: boolean;
  // observables
  workspaceUserInfo: Record<string, IWorkspaceMemberMe>; // workspaceSlug -> IWorkspaceMemberMe
  projectUserInfo: Record<string, Record<string, TProjectMembership>>; // workspaceSlug -> projectId -> TProjectMembership
  workspaceProjectsPermissions: Record<string, IUserProjectsRole>; // workspaceSlug -> IUserProjectsRole
  /** Matriz de ações de quem está logado, por espaço (`GET /roles/me/`). */
  workspaceActions: Record<string, TMyActions>;
  // computed helpers
  /** A pessoa pode fazer a ação (ou qualquer uma da lista) no espaço? Fonte: matriz de ações. */
  canDo: (action: TRequiredAction, workspaceSlug?: string) => boolean;
  /** Igual a `canDo`, e a pessoa participa do sistema. */
  canDoInProject: (action: TRequiredAction, workspaceSlug?: string, projectId?: string) => boolean;
  fetchMyWorkspaceActions: (workspaceSlug: string) => Promise<TMyActions | undefined>;
  workspaceInfoBySlug: (workspaceSlug: string) => IWorkspaceMemberMe | undefined;
  getWorkspaceRoleByWorkspaceSlug: (workspaceSlug: string) => TUserPermissions | EUserWorkspaceRoles | undefined;
  getProjectRolesByWorkspaceSlug: (workspaceSlug: string) => IUserProjectsRole;
  getProjectRoleByWorkspaceSlugAndProjectId: (
    workspaceSlug: string,
    projectId?: string
  ) => EUserPermissions | undefined;
  fetchWorkspaceLevelProjectEntities: (workspaceSlug: string, projectId: string) => void;
  // actions
  fetchUserWorkspaceInfo: (workspaceSlug: string) => Promise<IWorkspaceMemberMe>;
  leaveWorkspace: (workspaceSlug: string) => Promise<void>;
  fetchUserProjectInfo: (workspaceSlug: string, projectId: string) => Promise<TProjectMembership>;
  fetchUserProjectPermissions: (workspaceSlug: string) => Promise<IUserProjectsRole>;
  joinProject: (workspaceSlug: string, projectId: string) => Promise<void>;
  leaveProject: (workspaceSlug: string, projectId: string) => Promise<void>;
  hasPageAccess: (workspaceSlug: string, key: string) => boolean;
}

/**
 * @description This store is used to handle permission layer for the currently logged user.
 * It manages workspace and project level permissions, roles and access control.
 */
export abstract class BaseUserPermissionStore implements IBaseUserPermissionStore {
  loader: boolean = false;
  // constants
  workspaceUserInfo: Record<string, IWorkspaceMemberMe> = {};
  projectUserInfo: Record<string, Record<string, TProjectMembership>> = {};
  workspaceProjectsPermissions: Record<string, IUserProjectsRole> = {};
  workspaceActions: Record<string, TMyActions> = {};
  // services (atribuível nos testes)
  rolesService = rolesService;

  constructor(protected store: RootStore) {
    makeObservable(this, {
      // observables
      loader: observable.ref,
      workspaceUserInfo: observable,
      projectUserInfo: observable,
      workspaceProjectsPermissions: observable,
      workspaceActions: observable,
      // computed
      // actions
      fetchUserWorkspaceInfo: action,
      leaveWorkspace: action,
      fetchUserProjectInfo: action,
      fetchUserProjectPermissions: action,
      fetchMyWorkspaceActions: action,
      joinProject: action,
      leaveProject: action,
    });
  }

  // computed helpers
  /**
   * @description Returns the current workspace information
   * @param { string } workspaceSlug
   * @returns { IWorkspaceMemberMe | undefined }
   */
  workspaceInfoBySlug = computedFn((workspaceSlug: string): IWorkspaceMemberMe | undefined => {
    if (!workspaceSlug) return undefined;
    return this.workspaceUserInfo[workspaceSlug] || undefined;
  });

  /**
   * @description Returns the workspace role by slug
   * @param { string } workspaceSlug
   * @returns { TUserPermissions | EUserWorkspaceRoles | undefined }
   */
  getWorkspaceRoleByWorkspaceSlug = computedFn(
    (workspaceSlug: string): TUserPermissions | EUserWorkspaceRoles | undefined => {
      if (!workspaceSlug) return undefined;
      return this.workspaceUserInfo[workspaceSlug]?.role as TUserPermissions | EUserWorkspaceRoles | undefined;
    }
  );

  /**
   * @description Returns the project membership permission
   * @param { string } workspaceSlug
   * @param { string } projectId
   * @returns { EUserPermissions | undefined }
   */
  protected getProjectRole = computedFn((workspaceSlug: string, projectId?: string): EUserPermissions | undefined => {
    if (!workspaceSlug || !projectId) return undefined;
    const projectRole = this.workspaceProjectsPermissions?.[workspaceSlug]?.[projectId];
    if (!projectRole) return undefined;
    const workspaceRole = this.workspaceUserInfo?.[workspaceSlug]?.role;
    // permissao-estrutural: o admin do espaço participa de todo sistema com o nível dele (dado do vínculo, como o backend).
    if (workspaceRole === EUserWorkspaceRoles.ADMIN) return EUserPermissions.ADMIN;
    else return projectRole;
  });

  /**
   * @description Returns the project permissions by workspace slug
   * @param { string } workspaceSlug
   * @returns { IUserProjectsRole }
   */
  getProjectRolesByWorkspaceSlug = computedFn((workspaceSlug: string): IUserProjectsRole => {
    const projectPermissions = this.workspaceProjectsPermissions[workspaceSlug] || {};
    return Object.keys(projectPermissions).reduce((acc, projectId) => {
      const projectRole = this.getProjectRoleByWorkspaceSlugAndProjectId(workspaceSlug, projectId);
      if (projectRole) {
        acc[projectId] = projectRole;
      }
      return acc;
    }, {} as IUserProjectsRole);
  });

  /**
   * @description Returns the current project permissions
   * @param { string } workspaceSlug
   * @param { string } projectId
   * @returns { EUserPermissions | undefined }
   */
  abstract getProjectRoleByWorkspaceSlugAndProjectId: (
    workspaceSlug: string,
    projectId?: string
  ) => EUserPermissions | undefined;

  /**
   * @description Fetches project-level entities that are not automatically loaded by the project wrapper.
   * This is used when joining a project to ensure all necessary workspace-level project data is available.
   * @param { string } workspaceSlug
   * @param { string } projectId
   * @returns { Promise<void> }
   */
  abstract fetchWorkspaceLevelProjectEntities: (workspaceSlug: string, projectId: string) => void;

  /**
   * @description Returns whether the user has the permission to access a page
   * @param { string } page
   * @returns { boolean }
   */
  hasPageAccess = computedFn((workspaceSlug: string, key: string): boolean => {
    if (!workspaceSlug || !key) return false;
    const settings = WORKSPACE_SIDEBAR_DYNAMIC_NAVIGATION_ITEMS_LINKS.find((item) => item.key === key);
    // A tela exige a ação do item de menu; sem ação, basta ser membro do espaço.
    if (!settings) return false;
    return this.canDo(settings.action, workspaceSlug);
  });

  /**
   * A pessoa pode fazer a ação no espaço? Lê a matriz de ações (função + exceções
   * por pessoa), a mesma que o api-ts confere. Enquanto ela não chegou, nega.
   */
  canDo = computedFn((required: TRequiredAction, workspaceSlug?: string): boolean => {
    const slug = workspaceSlug || this.store.router.workspaceSlug || "";
    const myActions = this.workspaceActions[slug];
    if (!myActions) return false;
    return isRequiredActionAllowed(required, (key) => isActionAllowed(key, myActions.permissions, undefined));
  });

  /**
   * Ação dentro de um sistema: a função da pessoa é a do espaço; participar do
   * sistema (vínculo, ou admin e Gestor de Projeto, que o backend já devolve) é
   * o que restringe.
   */
  canDoInProject = computedFn((required: TRequiredAction, workspaceSlug?: string, projectId?: string): boolean => {
    const slug = workspaceSlug || this.store.router.workspaceSlug || "";
    const project = projectId || this.store.router.projectId;
    const isProjectMember = !!this.workspaceProjectsPermissions[slug]?.[project ?? ""];
    return isProjectMember && this.canDo(required, slug);
  });

  // actions
  /**
   * @description Fetches the user's workspace information
   * @param { string } workspaceSlug
   * @returns { Promise<IWorkspaceMemberMe | undefined> }
   */
  fetchUserWorkspaceInfo = async (workspaceSlug: string): Promise<IWorkspaceMemberMe> => {
    try {
      this.loader = true;
      const response = await workspaceService.workspaceMemberMe(workspaceSlug);
      if (response) {
        runInAction(() => {
          set(this.workspaceUserInfo, [workspaceSlug], response);
          this.loader = false;
        });
      }
      return response;
    } catch (error) {
      console.error("Error fetching user workspace information", error);
      this.loader = false;
      throw error;
    }
  };

  /**
   * @description Leaves a workspace
   * @param { string } workspaceSlug
   * @returns { Promise<void | undefined> }
   */
  leaveWorkspace = async (workspaceSlug: string): Promise<void> => {
    try {
      await userService.leaveWorkspace(workspaceSlug);
      runInAction(() => {
        unset(this.workspaceUserInfo, workspaceSlug);
        unset(this.projectUserInfo, workspaceSlug);
        unset(this.workspaceProjectsPermissions, workspaceSlug);
      });
    } catch (error) {
      console.error("Error user leaving the workspace", error);
      throw error;
    }
  };

  /**
   * @description Fetches the user's project information
   * @param { string } workspaceSlug
   * @param { string } projectId
   * @returns { Promise<TProjectMembership | undefined> }
   */
  fetchUserProjectInfo = async (workspaceSlug: string, projectId: string): Promise<TProjectMembership> => {
    try {
      const response = await projectMemberService.projectMemberMe(workspaceSlug, projectId);
      if (response) {
        runInAction(() => {
          set(this.projectUserInfo, [workspaceSlug, projectId], response);
          set(this.workspaceProjectsPermissions, [workspaceSlug, projectId], response.role);
        });
      }
      return response;
    } catch (error) {
      console.error("Error fetching user project information", error);
      throw error;
    }
  };

  /**
   * @description Fetches the user's project permissions
   * @param { string } workspaceSlug
   * @returns { Promise<IUserProjectsRole | undefined> }
   */
  fetchUserProjectPermissions = async (workspaceSlug: string): Promise<IUserProjectsRole> => {
    try {
      const response = await workspaceService.getWorkspaceUserProjectsRole(workspaceSlug);
      runInAction(() => {
        set(this.workspaceProjectsPermissions, [workspaceSlug], response);
      });
      return response;
    } catch (error) {
      console.error("Error fetching user project permissions", error);
      throw error;
    }
  };

  /** Carrega a matriz de ações de quem está logado no espaço (`GET /roles/me/`). */
  fetchMyWorkspaceActions = async (workspaceSlug: string): Promise<TMyActions | undefined> => {
    const response = await this.rolesService.me(workspaceSlug);
    if (!response) return response;
    runInAction(() => {
      set(this.workspaceActions, [workspaceSlug], response);
    });
    return response;
  };

  /**
   * @description Joins a project
   * @param { string } workspaceSlug
   * @param { string } projectId
   * @returns { Promise<void> }
   */
  joinProject = async (workspaceSlug: string, projectId: string): Promise<void> => {
    try {
      const response = await userService.joinProject(workspaceSlug, [projectId]);
      const projectMemberRole = this.getWorkspaceRoleByWorkspaceSlug(workspaceSlug) ?? EUserPermissions.MEMBER;
      if (response) {
        runInAction(() => {
          set(this.workspaceProjectsPermissions, [workspaceSlug, projectId], projectMemberRole);
        });
        void this.fetchWorkspaceLevelProjectEntities(workspaceSlug, projectId);
      }
    } catch (error) {
      console.error("Error user joining the project", error);
      throw error;
    }
  };

  /**
   * @description Leaves a project
   * @param { string } workspaceSlug
   * @param { string } projectId
   * @returns { Promise<void> }
   */
  leaveProject = async (workspaceSlug: string, projectId: string): Promise<void> => {
    try {
      await userService.leaveProject(workspaceSlug, projectId);
      runInAction(() => {
        unset(this.workspaceProjectsPermissions, [workspaceSlug, projectId]);
        unset(this.projectUserInfo, [workspaceSlug, projectId]);
        unset(this.store.projectRoot.project.projectMap, [projectId]);
      });
    } catch (error) {
      console.error("Error user leaving the project", error);
      throw error;
    }
  };
}
