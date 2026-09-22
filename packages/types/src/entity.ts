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
  /** With a third-party CNPJ, the responsible entity's CNPJ. Read-only. */
  effective_cnpj?: string | null;
  street?: string | null;
  address_number?: string | null;
  complement?: string | null;
  district?: string | null;
  /** Digits only. */
  zip_code?: string | null;
  fax?: string | null;
  state_registration?: string | null;
  website?: string | null;
  /** Sales representative: a workspace member. */
  representative_id?: string | null;
  representative_name?: string | null;
  /** Responsible entity; its CNPJ is used when `uses_third_party_cnpj`. */
  related_entity_id?: string | null;
  related_entity_name?: string | null;
  uses_third_party_cnpj?: boolean;
  is_active?: boolean;
  is_frozen?: boolean;
  frozen_at?: string | null;
  frozen_reason?: string | null;
};

/** One freeze/unfreeze entry (entity or member). */
export type TFreezeEvent = {
  id: string;
  action: "freeze" | "unfreeze";
  reason: string | null;
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
};

/** Frozen workspace member, as listed on the members settings screen. */
export type TFrozenMember = {
  id: string;
  email: string;
  display_name: string;
  is_active: boolean;
  is_frozen: boolean;
  frozen_at: string | null;
  frozen_reason: string | null;
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
  /** Systems (projects) the person looks after at the client. */
  project_ids?: string[];
  /** Read convenience sent by the server; send `project_ids` instead. */
  projects?: { id: string; name: string; identifier: string }[];
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
