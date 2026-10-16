/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TProfileSettingsTabs = "general" | "preferences" | "notifications" | "security" | "api-tokens";

export type TWorkspaceSettingsTabs = "general" | "members" | "roles" | "sla" | "billing-and-plans" | "export" | "webhooks" | "entities" | "ai" | "ia-requisitos" | "integrations-custom" | "storage" | "chat" | "print" | "auditoria" | "email" | "portal" | "paineis-tv" | "plugins";
export type TWorkspaceSettingsItem = {
  key: TWorkspaceSettingsTabs;
  i18n_label: string;
  href: string;
  /** Ação da matriz que a tela exige (lista = qualquer uma libera). Sem ação, todo membro do espaço. */
  action?: string | readonly string[];
  highlight: (pathname: string, baseUrl: string) => boolean;
};

export type TProjectSettingsTabs =
  | "general"
  | "members"
  | "features_cycles"
  | "features_modules"
  | "features_views"
  | "features_pages"
  | "features_intake"
  | "states"
  | "labels"
  | "estimates"
  | "automations"
  | "permissions";
export type TProjectSettingsItem = {
  key: TProjectSettingsTabs;
  i18n_label: string;
  href: string;
  /** Ação da matriz que a tela exige (lista = qualquer uma libera). Sem ação, todo membro do sistema. */
  action?: string | readonly string[];
  highlight: (pathname: string, baseUrl: string) => boolean;
};
