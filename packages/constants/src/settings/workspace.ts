/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type {TWorkspaceSettingsItem, TWorkspaceSettingsTabs} from "@plane/types";

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

// `action`: a ação da matriz que a tela exige (a mesma que a rota do api-ts confere).
// Lista = qualquer uma libera. Sem `action`, todo membro do espaço vê o item.
export const WORKSPACE_SETTINGS: Record<TWorkspaceSettingsTabs, TWorkspaceSettingsItem> = {
  general: {
    key: "general",
    i18n_label: "workspace_settings.settings.general.title",
    href: `/settings`,
    action: "workspace.settings",
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/`,
  },
  members: {
    key: "members",
    i18n_label: "workspace_settings.settings.members.title",
    href: `/settings/members`,
    action: ["workspace.invite", "workspace.members"],
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/members/`,
  },
  roles: {
    key: "roles",
    i18n_label: "workspace_settings.settings.roles.title",
    href: `/settings/roles`,
    action: "role.manage",
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/roles/`,
  },
  sla: {
    key: "sla",
    i18n_label: "workspace_settings.settings.sla.title",
    href: `/settings/sla`,
    action: "label.sla",
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/sla/`,
  },
  // "billing-and-plans": {
  //   key: "billing-and-plans",
  //   i18n_label: "workspace_settings.settings.billing_and_plans.title",
  //   href: `/settings/billing`,
  //   action: "workspace.settings",
  //   highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/billing/`,
  // },
  export: {
    key: "export",
    i18n_label: "workspace_settings.settings.exports.title",
    href: `/settings/exports`,
    action: "issue.export",
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/exports/`,
  },
  webhooks: {
    key: "webhooks",
    i18n_label: "workspace_settings.settings.webhooks.title",
    href: `/settings/webhooks`,
    action: "integration.manage",
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/webhooks/`,
  },
  entities: {
    key: "entities",
    i18n_label: "workspace_settings.settings.entities.title",
    href: `/settings/entities`,
    action: "entity.manage",
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/entities/`,
  },
  ai: {
    key: "ai",
    i18n_label: "workspace_settings.settings.ai.title",
    href: `/settings/ai`,
    action: "ai.config",
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/ai/`,
  },
  "integrations-custom": {
    key: "integrations-custom",
    i18n_label: "workspace_settings.settings.integrations_custom.title",
    href: `/settings/integrations-custom`,
    action: "workspace.settings",
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/integrations-custom/`,
  },
  storage: {
    key: "storage",
    i18n_label: "workspace_settings.settings.storage.title",
    href: `/settings/storage`,
    action: "workspace.settings",
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/storage/`,
  },
  email: {
    key: "email",
    i18n_label: "workspace_settings.settings.email.title",
    href: `/settings/email`,
    action: "workspace.settings",
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/email/`,
  },
  chat: {
    key: "chat",
    i18n_label: "workspace_settings.settings.chat.title",
    href: `/settings/chat`,
    // A tela só liga o chat e aponta o backend (PATCH /chat-config/); as frases do espaço ficam no Atendimento.
    action: "chat.configurar",
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/chat/`,
  },
  print: {
    key: "print",
    i18n_label: "workspace_settings.settings.print.title",
    href: `/settings/print`,
    action: "workspace.settings",
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/print/`,
  },
  "ia-requisitos": {
    key: "ia-requisitos",
    i18n_label: "workspace_settings.settings.ia_requisitos.title",
    href: `/settings/ia-requisitos`,
    action: "workspace.settings",
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/ia-requisitos/`,
  },
  portal: {
    key: "portal",
    i18n_label: "workspace_settings.settings.portal.title",
    href: `/settings/portal`,
    action: "portal.manage",
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/portal/`,
  },
  "paineis-tv": {
    key: "paineis-tv",
    i18n_label: "workspace_settings.settings.paineis_tv.title",
    href: `/settings/paineis-tv`,
    action: "panel.manage",
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/paineis-tv/`,
  },
  plugins: {
    key: "plugins",
    i18n_label: "workspace_settings.settings.plugins.title",
    href: `/settings/plugins`,
    action: "plugin.manage",
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/plugins/`,
  },
  auditoria: {
    key: "auditoria",
    i18n_label: "workspace_settings.settings.auditoria.title",
    href: `/settings/auditoria`,
    action: "audit.view",
    highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/auditoria/`,
  },
};

/** href da tela de configuração → ação que ela exige (sem ação: todo membro). */
export const WORKSPACE_SETTINGS_ACTIONS: Record<string, TWorkspaceSettingsItem["action"]> = Object.fromEntries(
  Object.values(WORKSPACE_SETTINGS).map(({href, action}) => [href, action]),
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
    WORKSPACE_SETTINGS["email"],
    WORKSPACE_SETTINGS["chat"],
    WORKSPACE_SETTINGS["portal"],
    WORKSPACE_SETTINGS["ia-requisitos"],
    WORKSPACE_SETTINGS["print"],
    WORKSPACE_SETTINGS["paineis-tv"],
    WORKSPACE_SETTINGS["plugins"],
    WORKSPACE_SETTINGS["auditoria"],
  ].filter(Boolean) as TWorkspaceSettingsItem[],
  [WORKSPACE_SETTINGS_CATEGORY.FEATURES]: [],
  [WORKSPACE_SETTINGS_CATEGORY.DEVELOPER]: [
    WORKSPACE_SETTINGS["webhooks"],
    WORKSPACE_SETTINGS["ai"],
    WORKSPACE_SETTINGS["integrations-custom"],
  ],
};
