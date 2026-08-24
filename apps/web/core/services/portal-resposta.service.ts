/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Resposta ao cliente do portal quando o chamado que ele abriu é concluído.
// O backend é quem sabe quais chamados nasceram no portal e quais ainda estão
// sem retorno — ver apps/api-ts/src/modules/portal/resposta.ts.

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

/** Um chamado concluído, nascido no portal, ainda sem resposta ao cliente. */
export type TRespostaPendente = {
  issue_id: string;
  project_id: string;
  codigo: string;
  titulo: string;
  sistema: string;
  estado: string;
  cliente: string;
  concluido_em: string | null;
};

export class PortalRespostaService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  /** O que este usuário precisa responder. */
  async pendentes(workspaceSlug: string): Promise<TRespostaPendente[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/portal-answers/pending/`)
      .then((res) => res?.data?.results ?? [])
      .catch(() => []);
  }

  /** Envia a resposta que o cliente vai ler no portal. */
  async responder(workspaceSlug: string, issueId: string, resposta: string): Promise<void> {
    return this.post(`/api/workspaces/${workspaceSlug}/portal-answers/${issueId}/`, { resposta })
      .then(() => undefined)
      .catch((err) => {
        throw err?.response?.data ?? err;
      });
  }

  /** Conclui sem responder — decisão explícita, gravada com autor e hora. */
  async pular(workspaceSlug: string, issueId: string, motivo?: string): Promise<void> {
    return this.post(`/api/workspaces/${workspaceSlug}/portal-answers/${issueId}/`, { pular: true, motivo })
      .then(() => undefined)
      .catch((err) => {
        throw err?.response?.data ?? err;
      });
  }
}

export const portalRespostaService = new PortalRespostaService();
