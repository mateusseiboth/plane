/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type {TWorkspaceSettingsItem, TWorkspaceSettingsTabs} from "@plane/types";
import {EUserWorkspaceRoles} from "@plane/types";

export enum WORKSPACE_SETTINGS_CATEGORY {
  ADMINISTRATION = "administration",
  FEATURES = "features",
  DEVELOPER = "developer",
}

export const WORKSPACE_SETTINGS_CATEGORIES: WORKSPACE_SETTINGS_CATEGORY[] = [
  WORKSPACE_SETTINGS_CATEGORY.ADMINISTRATION,
  WORKSPACE_SETTINGS_CATEGORY.FEATURES,
  WORKSPACE_SETTINGS_CATEGORY.DEVELOPER,
];

export const WORKSPACE_SETTINGS_CATEGORY_LABELS: Record<WORKSPACE_SETTINGS_CATEGORY, string> = {
  [WORKSPACE_SETTINGS_CATEGORY.ADMINISTRATION]: "common.administration",
  [WORKSPACE_SETTINGS_CATEGORY.FEATURES]: "common.features",
  [WORKSPACE_SETTINGS_CATEGORY.DEVELOPER]: "common.developer",
};

export const WORKSPACE_SETTINGS: Record<TWorkspaceSettingsTabs, TWorkspaceSettingsItem> = {
  general: {
    key: "general",
    i18n_label: "workspace_settings.settings.general.title",
    href: `/settings`,
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/`,
  },
  members: {
    key: "members",
    i18n_label: "workspace_settings.settings.members.title",
    href: `/settings/members`,
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/members/`,
  },
  roles: {
    key: "roles",
    i18n_label: "workspace_settings.settings.roles.title",
    href: `/settings/roles`,
    access: [EUserWorkspaceRoles.ADMIN],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/roles/`,
  },
  sla: {
    key: "sla",
    i18n_label: "workspace_settings.settings.sla.title",
    href: `/settings/sla`,
    access: [EUserWorkspaceRoles.ADMIN],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/sla/`,
  },
  // "billing-and-plans": {
  //   key: "billing-and-plans",
  //   i18n_label: "workspace_settings.settings.billing_and_plans.title",
  //   href: `/settings/billing`,
  //   access: [EUserWorkspaceRoles.ADMIN],
  //   highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/billing/`,
  // },
  export: {
    key: "export",
    i18n_label: "workspace_settings.settings.exports.title",
    href: `/settings/exports`,
    access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/exports/`,
  },
  webhooks: {
    key: "webhooks",
    i18n_label: "workspace_settings.settings.webhooks.title",
    href: `/settings/webhooks`,
    access: [EUserWorkspaceRoles.ADMIN],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/webhooks/`,
  },
  entities: {
    key: "entities",
    i18n_label: "workspace_settings.settings.entities.title",
    href: `/settings/entities`,
    access: [EUserWorkspaceRoles.ADMIN],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/entities/`,
  },
  ai: {
    key: "ai",
    i18n_label: "workspace_settings.settings.ai.title",
    href: `/settings/ai`,
    access: [EUserWorkspaceRoles.ADMIN],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/ai/`,
  },
  "integrations-custom": {
    key: "integrations-custom",
    i18n_label: "workspace_settings.settings.integrations_custom.title",
    href: `/settings/integrations-custom`,
    access: [EUserWorkspaceRoles.ADMIN],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/integrations-custom/`,
  },
  storage: {
    key: "storage",
    i18n_label: "workspace_settings.settings.storage.title",
    href: `/settings/storage`,
    access: [EUserWorkspaceRoles.ADMIN],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/storage/`,
  },
};

export const WORKSPACE_SETTINGS_ACCESS = Object.fromEntries(
  Object.entries(WORKSPACE_SETTINGS).map(([_, {href, access}]) => [href, access]),
);

export const GROUPED_WORKSPACE_SETTINGS: Record<WORKSPACE_SETTINGS_CATEGORY, TWorkspaceSettingsItem[]> = {
  [WORKSPACE_SETTINGS_CATEGORY.ADMINISTRATION]: [
    WORKSPACE_SETTINGS["general"],
    WORKSPACE_SETTINGS["members"],
    WORKSPACE_SETTINGS["roles"],
    WORKSPACE_SETTINGS["sla"],
    WORKSPACE_SETTINGS["entities"],
    // WORKSPACE_SETTINGS["billing-and-plans"], // Not implemented yet
    WORKSPACE_SETTINGS["export"],
    WORKSPACE_SETTINGS["storage"],
  ].filter(Boolean) as TWorkspaceSettingsItem[],
  [WORKSPACE_SETTINGS_CATEGORY.FEATURES]: [],
  [WORKSPACE_SETTINGS_CATEGORY.DEVELOPER]: [
    WORKSPACE_SETTINGS["webhooks"],
    WORKSPACE_SETTINGS["ai"],
    WORKSPACE_SETTINGS["integrations-custom"],
  ],
};
