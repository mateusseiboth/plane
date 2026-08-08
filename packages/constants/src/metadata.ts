/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Whitelabel branding.
 *
 * This fork ("Avião") is whitelabel-ready: change the product name, tagline and
 * URLs from a single place. Override at build time with VITE_ env vars (the same
 * mechanism the rest of the web app uses), or just edit the defaults below.
 *
 *   VITE_APP_NAME=Avião
 *   VITE_APP_TAGLINE="Gestão de chamados, visitas e projetos"
 *   VITE_APP_URL=https://app.example.com
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Product / brand name. Single switch point for whitelabel builds. */
export const APP_NAME = process.env.VITE_APP_NAME || "Avião";
/** Short tagline shown alongside the product name. */
export const APP_TAGLINE = process.env.VITE_APP_TAGLINE || "Gestão de chamados, visitas e projetos";
/** Marketing / app URL. */
export const APP_URL = process.env.VITE_APP_URL || "https://www.qualitysistemas.com.br";

/**
 * Canais de suporte. Os links de ajuda do produto (menu "?", tela de erro,
 * manutenção, termos) apontam para cá — o fork não fala com o suporte do Plane.
 * O e-mail fica em `endpoints.ts` (SUPPORT_EMAIL), junto das demais URLs.
 * Trocar por env: VITE_SUPPORT_SITE / VITE_DOCS_URL.
 */
export const SUPPORT_SITE = process.env.VITE_SUPPORT_SITE || APP_URL;
export const DOCS_URL = process.env.VITE_DOCS_URL || SUPPORT_SITE;

/** Links jurídicos exibidos na tela de entrada. Ajuste por env quando existirem páginas próprias. */
export const TERMS_URL = process.env.VITE_TERMS_URL || SUPPORT_SITE;
export const PRIVACY_URL = process.env.VITE_PRIVACY_URL || SUPPORT_SITE;

export const SITE_NAME = `${APP_NAME} | ${APP_TAGLINE}`;
export const SITE_TITLE = `${APP_NAME} | ${APP_TAGLINE}`;
export const SITE_DESCRIPTION =
  "Sistema de chamados, atendimento e visitas técnicas da Quality Sistemas: triagem, acompanhamento e indicadores num só lugar";
export const SITE_KEYWORDS =
  "chamados, service desk, atendimento, suporte, gestão de projetos, triagem, kanban, ciclos, módulos, SLA, quality sistemas";
export const SITE_URL = APP_URL;
export const TWITTER_USER_NAME = `${APP_NAME} | ${APP_TAGLINE}`;

// Publish (Spaces) metadata
export const SPACE_SITE_NAME = `${APP_NAME} Publish | Torne seus quadros e roadmaps públicos com um clique.`;
export const SPACE_SITE_TITLE = `${APP_NAME} Publish | Torne seus quadros públicos com um clique`;
export const SPACE_SITE_DESCRIPTION = `${APP_NAME} Publish é uma ferramenta de gestão de feedback de clientes.`;
export const SPACE_SITE_KEYWORDS =
  "chamados, feedback de clientes, quadros públicos, roadmap, gestão de projetos, kanban, quality sistemas";
export const SPACE_SITE_URL = APP_URL;
export const SPACE_TWITTER_USER_NAME = APP_NAME;
