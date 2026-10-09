/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IWorkspaceSidebarNavigationItem } from "@plane/constants";
import {
  WORKSPACE_SIDEBAR_DYNAMIC_NAVIGATION_ITEMS_LINKS,
  WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS,
} from "@plane/constants";

/**
 * Regra única de fixação da barra lateral. Todo item do catálogo pode ser fixado
 * e desfixado pela pessoa; o desfixado sai da barra e continua no menu Mais.
 * A escolha vem de `/sidebar-preferences/` (por pessoa e por espaço).
 */
export type TPreferenciaDaBarra = { is_pinned?: boolean; sort_order?: number };
export type TPreferenciasDaBarra = Record<string, TPreferenciaDaBarra | undefined>;

// A Página inicial é a porta de entrada do espaço: é o único item que não sai da barra.
const CHAVES_SEMPRE_NA_BARRA = new Set(["home"]);

// Quem nunca mexeu nas preferências vê a barra como ela sempre foi.
const CHAVES_FIXADAS_POR_PADRAO = new Set([
  "your_work",
  "drafts",
  "projects",
  "all-work-items",
  "global-intake",
  "visits",
  "contatos",
  "mural",
  "wiki",
  "ouvidoria",
  "denuncias",
  "curriculos",
  "pos-atendimento",
  "links-uteis",
  "reports",
]);

/** Itens pessoais, na ordem em que aparecem na barra quando não há ordem gravada. */
export const ITENS_PESSOAIS_DA_BARRA: IWorkspaceSidebarNavigationItem[] = [
  WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS["stickies"],
  WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS["your-work"],
  WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS["drafts"],
];

/** Itens do bloco Espaço, na ordem do catálogo. */
export const ITENS_DO_ESPACO_NA_BARRA: IWorkspaceSidebarNavigationItem[] = [
  WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS["projects"],
  ...WORKSPACE_SIDEBAR_DYNAMIC_NAVIGATION_ITEMS_LINKS,
];

/** Tudo o que o menu Mais oferece para fixar e desfixar. */
export const ITENS_DO_MENU_MAIS: IWorkspaceSidebarNavigationItem[] = [
  ...ITENS_PESSOAIS_DA_BARRA,
  ...ITENS_DO_ESPACO_NA_BARRA,
];

export const isItemFixadoNaBarra = (key: string, preferencias: TPreferenciasDaBarra): boolean =>
  CHAVES_SEMPRE_NA_BARRA.has(key) || (preferencias[key]?.is_pinned ?? CHAVES_FIXADAS_POR_PADRAO.has(key));

const readOrdem = (key: string, preferencias: TPreferenciasDaBarra) => preferencias[key]?.sort_order ?? 0;

const withEstado = <T extends { key: string }>(itens: T[], preferencias: TPreferenciasDaBarra) =>
  itens.map((item) => ({
    ...item,
    is_pinned: isItemFixadoNaBarra(item.key, preferencias),
    sort_order: readOrdem(item.key, preferencias),
  }));

/** O que aparece na barra: só os fixados, pela ordem gravada (o catálogo desempata). */
export const buildItensDaBarra = <T extends { key: string }>(itens: T[], preferencias: TPreferenciasDaBarra) =>
  withEstado(itens, preferencias)
    .filter((item) => item.is_pinned)
    .sort((a, b) => a.sort_order - b.sort_order);

/** O que aparece no menu Mais: fixados primeiro, depois os desfixados, cada grupo pela ordem gravada. */
export const buildItensDoMenuMais = <T extends { key: string }>(itens: T[], preferencias: TPreferenciasDaBarra) =>
  withEstado(
    itens.filter((item) => !CHAVES_SEMPRE_NA_BARRA.has(item.key)),
    preferencias
  ).sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || a.sort_order - b.sort_order);
