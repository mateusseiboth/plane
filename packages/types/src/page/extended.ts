/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Hierarquia da página (wiki do espaço e páginas de sistema): a mãe, a posição
 * entre as irmãs e quantas filhas ativas ela tem.
 */
export type TPageExtended = {
  parent_id?: string | null;
  sort_order?: number;
  sub_pages_count?: number;
};

/** Uma página achada pela busca da wiki (`GET /workspaces/:slug/wiki/search/`). */
export type TWikiSearchResult = {
  id: string;
  name: string;
  parent_id: string | null;
  excerpt: string;
};
