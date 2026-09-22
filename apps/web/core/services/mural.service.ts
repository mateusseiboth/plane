/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Mural de recados da home. Contrato em apps/api-ts/src/modules/mural e
// `.claude/mural.md`. Todo membro lê; publicar exige `mural.publish`.

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TMuralPessoa = {
  id: string;
  display_name: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
};

export type TMuralAnexo = {
  id: string;
  name: string;
  size: number;
  mime_type: string | null;
  url: string;
};

export type TMuralRecado = {
  id: string;
  title: string;
  description_html: string;
  description_stripped: string;
  author: TMuralPessoa | null;
  published_at: string;
  updated_at: string;
  expires_at: string | null;
  is_pinned: boolean;
  is_required: boolean;
  is_active: boolean;
  is_expired: boolean;
  attachment: TMuralAnexo | null;
  is_read: boolean;
  read_at: string | null;
};

export type TMuralRecadoPayload = {
  title?: string;
  description_html?: string;
  is_pinned?: boolean;
  is_required?: boolean;
  is_active?: boolean;
  expires_at?: string | null;
  attachment_id?: string | null;
};

export type TMuralPagina = {
  results: TMuralRecado[];
  total_count: number;
  next_cursor: string;
  prev_cursor: string;
  next_page_results: boolean;
  prev_page_results: boolean;
};

export type TMuralLeitores = {
  read: (TMuralPessoa & { read_at: string })[];
  unread: TMuralPessoa[];
};

const rethrow = (err: { response?: { data?: unknown } }) => {
  throw err?.response?.data;
};

export class MuralService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private base(slug: string) {
    return `/api/workspaces/${slug}/mural`;
  }

  async list(slug: string, query: string): Promise<TMuralPagina> {
    return this.get(`${this.base(slug)}/${query}`)
      .then((res) => res?.data)
      .catch(rethrow);
  }

  async home(slug: string): Promise<TMuralRecado[]> {
    return this.get(`${this.base(slug)}/home/`)
      .then((res) => res?.data ?? [])
      .catch(rethrow);
  }

  async pendingRequired(slug: string): Promise<TMuralRecado[]> {
    return this.get(`${this.base(slug)}/pending-required/`)
      .then((res) => res?.data ?? [])
      .catch(rethrow);
  }

  async retrieve(slug: string, id: string): Promise<TMuralRecado> {
    return this.get(`${this.base(slug)}/${id}/`)
      .then((res) => res?.data)
      .catch(rethrow);
  }

  async create(slug: string, data: TMuralRecadoPayload): Promise<TMuralRecado> {
    return this.post(`${this.base(slug)}/`, data)
      .then((res) => res?.data)
      .catch(rethrow);
  }

  async update(slug: string, id: string, data: TMuralRecadoPayload): Promise<TMuralRecado> {
    return this.patch(`${this.base(slug)}/${id}/`, data)
      .then((res) => res?.data)
      .catch(rethrow);
  }

  async markRead(slug: string, id: string): Promise<void> {
    return this.post(`${this.base(slug)}/${id}/read/`, {})
      .then(() => undefined)
      .catch(rethrow);
  }

  async readers(slug: string, id: string): Promise<TMuralLeitores> {
    return this.get(`${this.base(slug)}/${id}/readers/`)
      .then((res) => res?.data)
      .catch(rethrow);
  }
}

const muralService = new MuralService();

export default muralService;
