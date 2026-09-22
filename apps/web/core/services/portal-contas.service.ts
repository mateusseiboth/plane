/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Contas do portal do cliente (Configurações > Portal do cliente) e o que o
// portal trouxe para dentro do chamado (conta que abriu e avaliações).
// Backend: apps/api-ts/src/modules/portal/index.ts.

import { API_BASE_URL } from "@plane/constants";
import type { TPortalConta, TPortalContaPayload } from "@/components/portal/contas/portal-conta-rules";
import { APIService } from "@/services/api.service";

export type TRedefinicaoDeSenha =
  | { mode: "email"; detail: string }
  | { mode: "provisoria"; detail: string; password: string };

export type TListaDeContas = { results: TPortalConta[]; email_enabled: boolean };

export type TAvaliacaoDoCliente = {
  id: string;
  service_rating: number;
  service_rating_label: string;
  expectation: number;
  expectation_label: string;
  comment: string | null;
  created_at: string;
  is_current: boolean;
};

export type TPortalDoChamado = {
  account: { id: string; name: string; email: string };
  evaluations: TAvaliacaoDoCliente[];
};

const rethrow = (err: any) => {
  throw err?.response?.data ?? err;
};

export class PortalContasService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string): Promise<TListaDeContas> {
    return this.get(`/api/workspaces/${workspaceSlug}/portal-accounts/`)
      .then((res) => ({ results: res?.data?.results ?? [], email_enabled: Boolean(res?.data?.email_enabled) }))
      .catch(rethrow);
  }

  async create(workspaceSlug: string, data: TPortalContaPayload): Promise<TPortalConta> {
    return this.post(`/api/workspaces/${workspaceSlug}/portal-accounts/`, data)
      .then((res) => res?.data)
      .catch(rethrow);
  }

  async update(workspaceSlug: string, id: string, data: Partial<TPortalContaPayload>): Promise<TPortalConta> {
    return this.patch(`/api/workspaces/${workspaceSlug}/portal-accounts/${id}`, data)
      .then((res) => res?.data)
      .catch(rethrow);
  }

  /** Sem `modo`, a API escolhe: link por e-mail quando há SMTP, senão senha provisória. */
  async resetPassword(workspaceSlug: string, id: string, modo?: "email" | "provisoria"): Promise<TRedefinicaoDeSenha> {
    return this.post(`/api/workspaces/${workspaceSlug}/portal-accounts/${id}/reset-password/`, modo ? { modo } : {})
      .then((res) => res?.data)
      .catch(rethrow);
  }

  /** `null` quando o chamado não veio do portal. */
  async readDoChamado(workspaceSlug: string, issueId: string): Promise<TPortalDoChamado | null> {
    return this.get(`/api/workspaces/${workspaceSlug}/portal-requests/${issueId}/`)
      .then((res) => res?.data ?? null)
      .catch((err) => {
        if (err?.response?.status === 404) return null;
        return rethrow(err);
      });
  }
}

const portalContasService = new PortalContasService();
export default portalContasService;
