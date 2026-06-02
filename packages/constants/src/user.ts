/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export enum EAuthenticationPageType {
  STATIC = "STATIC",
  NOT_AUTHENTICATED = "NOT_AUTHENTICATED",
  AUTHENTICATED = "AUTHENTICATED",
}

export enum EInstancePageType {
  PRE_SETUP = "PRE_SETUP",
  POST_SETUP = "POST_SETUP",
}

export enum EUserStatus {
  ERROR = "ERROR",
  AUTHENTICATION_NOT_DONE = "AUTHENTICATION_NOT_DONE",
  NOT_YET_READY = "NOT_YET_READY",
}

export type TUserStatus = {
  status: EUserStatus | undefined;
  message?: string;
};

export enum EUserPermissionsLevel {
  WORKSPACE = "WORKSPACE",
  PROJECT = "PROJECT",
}

export type TUserPermissionsLevel = EUserPermissionsLevel;

export enum EUserPermissions {
  ADMIN = 20,
  GESTOR_PROJETO = 18,
  MEMBER = 15,
  TI = 12,
  QUALIDADE = 8,
  ATENDIMENTO = 6,
  GUEST = 5,
}
export type TUserPermissions = EUserPermissions;

/**
 * Roles that can *see* project work surfaces — the work-related sidebar entries,
 * project listings, "your work", drafts, intake, and read-only board/list views.
 * This is the broadest set: TI, Qualidade and Atendimento all get the same entries
 * as admins (reports/analytics are excluded elsewhere). Fine-grained movement and
 * board-visibility rules are still enforced by the workflow-role checks.
 */
export const PROJECT_VIEW_ROLES: EUserPermissions[] = [
  EUserPermissions.ADMIN,
  EUserPermissions.GESTOR_PROJETO,
  EUserPermissions.MEMBER,
  EUserPermissions.TI,
  EUserPermissions.QUALIDADE,
  EUserPermissions.ATENDIMENTO,
];

/**
 * Roles that can *create/edit/move work items* and manage cycles, modules and
 * views. The "near-admin" set: TI and Qualidade act like admins here. Atendimento
 * is intentionally excluded — that role only opens intake (chamados), never work
 * items (see the D2 rule in the sidebar quick-actions).
 */
export const PROJECT_WORK_ROLES: EUserPermissions[] = [
  EUserPermissions.ADMIN,
  EUserPermissions.GESTOR_PROJETO,
  EUserPermissions.MEMBER,
  EUserPermissions.TI,
  EUserPermissions.QUALIDADE,
];

/**
 * Roles allowed to change *project configuration* (states, labels, project
 * members, etc.). Only admins and project managers — plus the legacy MEMBER role —
 * may touch config; TI / Qualidade / Atendimento are intentionally excluded.
 */
export const PROJECT_CONFIG_ROLES: EUserPermissions[] = [
  EUserPermissions.ADMIN,
  EUserPermissions.GESTOR_PROJETO,
  EUserPermissions.MEMBER,
];

/**
 * Roles allowed to *create new projects*. Only admins and project managers —
 * regular members, TI, Qualidade and Atendimento cannot create projects.
 */
export const PROJECT_CREATE_ROLES: EUserPermissions[] = [
  EUserPermissions.ADMIN,
  EUserPermissions.GESTOR_PROJETO,
];

export type TUserAllowedPermissionsObject = {
  create: TUserPermissions[];
  update: TUserPermissions[];
  delete: TUserPermissions[];
  read: TUserPermissions[];
};
export type TUserAllowedPermissions = {
  workspace: {
    [key: string]: Partial<TUserAllowedPermissionsObject>;
  };
  project: {
    [key: string]: Partial<TUserAllowedPermissionsObject>;
  };
};

export const USER_ALLOWED_PERMISSIONS: TUserAllowedPermissions = {
  workspace: {
    dashboard: {
      read: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
    },
  },
  project: {},
};
