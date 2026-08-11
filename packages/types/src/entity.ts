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

/**
 * Responsável = the flesh-and-blood person inside an entity (prefeito,
 * secretário, técnico de T.I., usuário do sistema). Contract:
 * `.claude/CONTRATO_RESPONSAVEIS.md`.
 */
export type TEntityContact = {
  id: string;
  entity_id?: string | null;
  /** Read convenience sent by the server; never part of the payload. */
  entity_name?: string | null;
  type_id?: string | null;
  type_name?: string | null;
  /** Comes from the type, not from the contact itself. */
  is_system_user?: boolean;
  user_id?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  /** Digits only, with DDI. Derived on the server, never sent by the client. */
  phone_digits?: string | null;
  photo?: string | null;
  /** ISO date, no time. */
  birth_date?: string | null;
  is_active?: boolean;
  receive_messages?: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

/** Papel do responsável dentro do órgão (Prefeito, Secretário, Técnico T.I.). */
export type TEntityContactType = {
  id: string;
  name: string;
  is_active?: boolean;
  is_system_user?: boolean;
  sequence?: number;
  created_at?: string;
  updated_at?: string;
};
