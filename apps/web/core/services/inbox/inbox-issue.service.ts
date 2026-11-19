/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TInboxIssue, TIssue, TInboxIssueWithPagination } from "@plane/types";
import { EInboxIssueSource } from "@plane/types";
// helpers
// services
import type { TResumoDaTriagem } from "@/components/inbox/global/resumo-da-triagem";
import { APIService } from "@/services/api.service";

export class InboxIssueService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, projectId: string, params = {}): Promise<TInboxIssueWithPagination> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/inbox-issues/`, {
      params,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * Todos os sistemas do espaço para abrir solicitação (quem tem `intake.create`),
   * sem filtro por vínculo: o Atendimento abre pedido para qualquer sistema.
   */
  async listSistemasParaSolicitacao(
    workspaceSlug: string
  ): Promise<Array<{ id: string; name: string; identifier: string }>> {
    return this.get(`/api/workspaces/${workspaceSlug}/sistemas-para-solicitacao/`)
      .then((response) => response?.data ?? [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** O número do menu Solicitação/Triagem (ver `resumo-da-triagem.ts`). */
  async readResumoDaTriagem(workspaceSlug: string): Promise<TResumoDaTriagem> {
    return this.get(`/api/workspaces/${workspaceSlug}/global-intake-issues/resumo/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** Quem abriu viu a solicitação resolvida; devolve o número novo do menu. */
  async markSolicitacaoVista(workspaceSlug: string, issueId: string): Promise<TResumoDaTriagem> {
    return this.post(`/api/workspaces/${workspaceSlug}/global-intake-issues/${issueId}/visto/`, {})
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieve(workspaceSlug: string, projectId: string, inboxIssueId: string): Promise<TInboxIssue> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/inbox-issues/${inboxIssueId}/?expand=issue_inbox`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, projectId: string, data: Partial<TIssue>): Promise<TInboxIssue> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/inbox-issues/`, {
      source: EInboxIssueSource.IN_APP,
      issue: data,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    inboxIssueId: string,
    data: Partial<TInboxIssue>
  ): Promise<TInboxIssue> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/inbox-issues/${inboxIssueId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** "Não atendido": o chamado volta para a triagem com o motivo (mínimo de 10 caracteres). */
  async markNaoAtendido(workspaceSlug: string, projectId: string, issueId: string, motivo: string): Promise<void> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/inbox-issues/${issueId}/nao-atendido/`, {
      motivo,
    })
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** No atendimento: encaminha para a triagem da Qualidade. */
  async sendParaATriagem(workspaceSlug: string, projectId: string, issueId: string): Promise<void> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/inbox-issues/${issueId}/encaminhar/`, {})
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** No atendimento: encerra sem virar chamado, com a resposta para quem pediu. */
  async closeNoAtendimento(workspaceSlug: string, projectId: string, issueId: string, respostaHtml: string) {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/inbox-issues/${issueId}/encerrar-no-atendimento/`,
      { resposta_html: respostaHtml }
    )
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateIssue(
    workspaceSlug: string,
    projectId: string,
    inboxIssueId: string,
    data: Partial<TIssue>
  ): Promise<TInboxIssue> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/inbox-issues/${inboxIssueId}/`, {
      issue: data,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async destroy(workspaceSlug: string, projectId: string, inboxIssueId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/inbox-issues/${inboxIssueId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
