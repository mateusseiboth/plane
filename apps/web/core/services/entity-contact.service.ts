/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Contatos: as pessoas de carne e osso dentro de uma entidade (prefeito,
// secretário, técnico de T.I., usuário do sistema). Na interface o cadastro se
// chama "Contatos"; na visita técnica o bloco se chama "Responsáveis", que é
// quem recebeu o técnico. Contrato em `.claude/CONTRATO_RESPONSAVEIS.md`.

import { API_BASE_URL } from "@plane/constants";
import type { TEntityContact, TEntityContactType } from "@plane/types";
import { APIService } from "@/services/api.service";

export type { TEntityContact, TEntityContactType };

export type TEntityContactFilters = {
  entity_id?: string;
  type_id?: string;
  /** Casa nome, e-mail e telefone (só dígitos). */
  search?: string;
  is_active?: boolean;
  has_phone?: boolean;
};

/** Campos que o servidor aceita no POST/PATCH — `phone_digits` é derivado lá. */
export type TEntityContactPayload = Partial<
  Pick<
    TEntityContact,
    | "entity_id"
    | "type_id"
    | "user_id"
    | "name"
    | "email"
    | "phone"
    | "photo"
    | "birth_date"
    | "is_active"
    | "receive_messages"
    | "notes"
  >
>;

function toQuery(filters: Record<string, unknown> = {}): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * A listagem devolve array puro sem `per_page`/`cursor` e envelope paginado com
 * eles — mesma forma do módulo de entidades. A tela pede sempre a lista inteira,
 * então aceitamos as duas e normalizamos aqui.
 */
function toList(data: unknown): TEntityContact[] {
  if (Array.isArray(data)) return data as TEntityContact[];
  const results = (data as { results?: TEntityContact[] } | null)?.results;
  return Array.isArray(results) ? results : [];
}

export class EntityContactService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, filters: TEntityContactFilters = {}): Promise<TEntityContact[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/entity-contacts/${toQuery(filters)}`)
      .then((res) => toList(res?.data))
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  /** Atalho do contrato; mesma forma da listagem. */
  async listByEntity(workspaceSlug: string, entityId: string): Promise<TEntityContact[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/entities/${entityId}/contacts/`)
      .then((res) => toList(res?.data))
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async retrieve(workspaceSlug: string, contactId: string): Promise<TEntityContact> {
    return this.get(`/api/workspaces/${workspaceSlug}/entity-contacts/${contactId}/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async create(workspaceSlug: string, data: TEntityContactPayload): Promise<TEntityContact> {
    return this.post(`/api/workspaces/${workspaceSlug}/entity-contacts/`, data)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async update(workspaceSlug: string, contactId: string, data: TEntityContactPayload): Promise<TEntityContact> {
    return this.patch(`/api/workspaces/${workspaceSlug}/entity-contacts/${contactId}/`, data)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  /** Exclusão lógica no servidor (`deletedAt`). */
  async destroy(workspaceSlug: string, contactId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/entity-contacts/${contactId}/`)
      .then(() => undefined)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async listTypes(workspaceSlug: string): Promise<TEntityContactType[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/entity-contact-types/`)
      .then((res) => {
        const data = res?.data;
        if (Array.isArray(data)) return data as TEntityContactType[];
        return (data?.results ?? []) as TEntityContactType[];
      })
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async createType(workspaceSlug: string, data: Partial<TEntityContactType>): Promise<TEntityContactType> {
    return this.post(`/api/workspaces/${workspaceSlug}/entity-contact-types/`, data)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async updateType(
    workspaceSlug: string,
    typeId: string,
    data: Partial<TEntityContactType>
  ): Promise<TEntityContactType> {
    return this.patch(`/api/workspaces/${workspaceSlug}/entity-contact-types/${typeId}/`, data)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async destroyType(workspaceSlug: string, typeId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/entity-contact-types/${typeId}/`)
      .then(() => undefined)
      .catch((err) => {
        throw err?.response?.data;
      });
  }
}

const entityContactService = new EntityContactService();
export default entityContactService;
