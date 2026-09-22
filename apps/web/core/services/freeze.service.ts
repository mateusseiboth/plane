/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TFreezeEvent, TFrozenMember } from "@plane/types";
import { APIService } from "@/services/api.service";

/** Alvo do congelamento: entidade (cliente) ou membro (usuário). */
export type TFreezeSubject = "entity" | "member";

const SUBJECT_PATHS: Record<TFreezeSubject, string> = {
  entity: "entities",
  member: "members",
};

const rethrow = (err: any) => {
  throw err?.response?.data;
};

export class FreezeService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private basePath(workspaceSlug: string, subject: TFreezeSubject, id: string) {
    return `/api/workspaces/${workspaceSlug}/${SUBJECT_PATHS[subject]}/${id}`;
  }

  async freeze(workspaceSlug: string, subject: TFreezeSubject, id: string, reason: string) {
    return this.post(`${this.basePath(workspaceSlug, subject, id)}/freeze/`, { reason })
      .then((res) => res?.data)
      .catch(rethrow);
  }

  async unfreeze(workspaceSlug: string, subject: TFreezeSubject, id: string, reason: string) {
    return this.post(`${this.basePath(workspaceSlug, subject, id)}/unfreeze/`, { reason })
      .then((res) => res?.data)
      .catch(rethrow);
  }

  async listEvents(workspaceSlug: string, subject: TFreezeSubject, id: string): Promise<TFreezeEvent[]> {
    return this.get(`${this.basePath(workspaceSlug, subject, id)}/freeze-events/`)
      .then((res) => res?.data ?? [])
      .catch(rethrow);
  }

  async listFrozenMembers(workspaceSlug: string): Promise<TFrozenMember[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/frozen-members/`)
      .then((res) => res?.data ?? [])
      .catch(rethrow);
  }
}

const freezeService = new FreezeService();
export default freezeService;
