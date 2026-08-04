/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Entity = the customer/organization a work item belongs to
 * (Prefeitura, Câmara, Escola, ...).
 */
export type TEntity = {
  id: string;
  name: string;
  entity_type?: number | null;
  city?: string | null;
  state?: string | null;
  email?: string | null;
  phone?: string | null;
  cnpj?: string | null;
  is_active?: boolean;
};
