/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Resposta a quem abriu uma solicitação, quando o chamado dela é concluído.
// Vale para QUALQUER origem — portal, atendimento ou aberta por dentro: em todas
// há alguém do outro lado esperando retorno. O backend é quem sabe quais
// chamados nasceram de solicitação e quais ainda estão sem resposta — ver
// apps/api-ts/src/modules/portal/resposta.ts.

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

/** Um chamado concluído, nascido de uma solicitação, ainda sem resposta. */
export type TRespostaPendente = {
  issue_id: string;
  project_id: string;
  codigo: string;
  titulo: string;
  sistema: string;
  estado: string;
  /** Nome de quem espera: a conta do portal ou quem abriu a solicitação. */
  cliente: string;
  /** "portal" muda o que a janela promete — ver `resposta-ao-cliente-modal`. */
  origem: string;
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

  /** Envia a resposta: o portal mostra na conta do cliente, as demais avisam quem abriu. */
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
