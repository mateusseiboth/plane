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
export const APP_URL = process.env.VITE_APP_URL || "https://app.plane.so/";

export const SITE_NAME = `${APP_NAME} | ${APP_TAGLINE}`;
export const SITE_TITLE = `${APP_NAME} | ${APP_TAGLINE}`;
export const SITE_DESCRIPTION =
  "Open-source project management tool to manage work items, cycles, and product roadmaps easily";
export const SITE_KEYWORDS =
  "software development, plan, ship, software, accelerate, code management, release management, project management, work items tracking, agile, scrum, kanban, collaboration";
export const SITE_URL = APP_URL;
export const TWITTER_USER_NAME = `${APP_NAME} | ${APP_TAGLINE}`;

// Publish (Spaces) metadata
export const SPACE_SITE_NAME = `${APP_NAME} Publish | Make your boards and roadmaps public with one click.`;
export const SPACE_SITE_TITLE = `${APP_NAME} Publish | Make your boards public with one-click`;
export const SPACE_SITE_DESCRIPTION = `${APP_NAME} Publish is a customer feedback management tool.`;
export const SPACE_SITE_KEYWORDS =
  "software development, customer feedback, software, accelerate, code management, release management, project management, work items tracking, agile, scrum, kanban, collaboration";
export const SPACE_SITE_URL = APP_URL;
export const SPACE_TWITTER_USER_NAME = APP_NAME;
