/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Trilha de auditoria (LGPD): consulta dos registros e envio dos eventos que só
// acontecem no navegador (impressão, exportação de tela).

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TAuditLog = {
  id: string;
  workspace_id: string;
  actor_id: string | null;
  actor_email: string | null;
  actor_ip: string | null;
  entity: string;
  entity_id: string;
  action: string;
  changes: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type TAuditLogPage = {
  results: TAuditLog[];
  total_count: number;
  next_cursor: string;
  prev_cursor: string;
  next_page_results: boolean;
  prev_page_results: boolean;
};

export type TAuditFilters = {
  entity?: string;
  entity_id?: string;
  actor_id?: string;
  /** Uma ou mais ações separadas por vírgula. */
  action?: string;
  date_from?: string;
  date_to?: string;
  cursor?: string;
};

/** Ações que o navegador pode registrar por conta própria. */
export type TClientAuditAction = "print" | "export" | "download" | "view";

function toQuery(filters: TAuditFilters = {}): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export class AuditService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  /** Trilha completa do workspace (somente administradores). */
  async list(workspaceSlug: string, filters: TAuditFilters = {}): Promise<TAuditLogPage> {
    return this.get(`/api/workspaces/${workspaceSlug}/audit-logs/${toQuery(filters)}`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  /** Os próprios acessos do usuário — direito de acesso do titular (LGPD). */
  async listMine(workspaceSlug: string, filters: TAuditFilters = {}): Promise<TAuditLogPage> {
    return this.get(`/api/workspaces/${workspaceSlug}/audit-logs/me/${toQuery(filters)}`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  /** URL do CSV — usada em link/download direto, preservando os filtros da tela. */
  exportUrl(workspaceSlug: string, filters: TAuditFilters = {}): string {
    return `${API_BASE_URL}/api/workspaces/${workspaceSlug}/audit-logs/export/${toQuery(filters)}`;
  }

  /**
   * Registra um evento que só existe no cliente. Nunca deve quebrar a ação do
   * usuário: uma falha de rede aqui não pode impedir a impressão.
   */
  async record(
    workspaceSlug: string,
    payload: { action: TClientAuditAction; entity: string; entity_id: string; metadata?: Record<string, unknown> }
  ): Promise<void> {
    return this.post(`/api/workspaces/${workspaceSlug}/audit-logs/`, payload)
      .then(() => undefined)
      .catch(() => undefined);
  }
}

export const auditService = new AuditService();
