/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Ligações do FreePBX no chat-backend: detalhe, assumir, concluir, vincular
// chamado, histórico do cliente, configuração de telefonia e relatório.
// Contrato em .claude/ligacoes-freepbx.md.

import { chatRequest, type ChatSession } from "@/services/chat.service";

export type Ligacao = {
  id: string;
  session_id: string;
  call_id: string;
  caller: string | null;
  extension: string | null;
  status: "answered" | "missed";
  started_at: string | null;
  ended_at: string | null;
  duration_sec: number | null;
  recording_url: string | null;
  descricao: string | null;
  concluded_by_id: string | null;
  concluded_at: string | null;
  ticket_kind: "issue" | "intake" | null;
  ticket_id: string | null;
  ticket_project_id: string | null;
  ticket_label: string | null;
  created_at: string;
};

export type ResponsavelDaLigacao = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  entity_id: string | null;
  entity_name: string | null;
};

export type LigacaoDetalhe = {
  session: ChatSession;
  ligacao: Ligacao | null;
  responsavel: ResponsavelDaLigacao | null;
};

export type ConclusaoDaLigacao = {
  project_id: string;
  descricao: string;
  contact?: { contact_id: string };
};

export type ItemDoHistorico = ChatSession & { attendant_name: string | null; ligacao: Ligacao | null };

export type RamalConfigurado = { id?: string; extension: string; user_id: string; name?: string | null };

export type TelefoniaConfig = {
  has_token: boolean;
  token_last4: string | null;
  updated_at: string | null;
  ramais: RamalConfigurado[];
};

type Contagem = { id: string | null; name: string; count: number };

export type RelatorioDeLigacoes = {
  days: number;
  total: number;
  answered: number;
  missed: number;
  concluded: number;
  by_attendant: (Contagem & { missed: number })[];
  by_entity: Contagem[];
  by_system: Contagem[];
};

/** Erro do chat-backend: `detail` para o aviso e `errors` para os campos. */
export type ErroDaLigacao = { detail?: string; errors?: { path: string; message: string }[] };

const jsonInit = (method: string, data?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  ...(data === undefined ? {} : { body: JSON.stringify(data) }),
});

const ligacao = (slug: string, id: string) => `/workspaces/${slug}/ligacoes/${id}`;
const telefonia = (slug: string) => `/workspaces/${slug}/config/telefonia`;

export function ligacoesApi(apiUrl: string) {
  const req = chatRequest(apiUrl);
  return {
    detail: (slug: string, id: string): Promise<LigacaoDetalhe> => req(`${ligacao(slug, id)}/`),
    assume: (slug: string, id: string): Promise<LigacaoDetalhe> =>
      req(`${ligacao(slug, id)}/assumir/`, jsonInit("POST")),
    conclude: (slug: string, id: string, data: ConclusaoDaLigacao): Promise<LigacaoDetalhe> =>
      req(`${ligacao(slug, id)}/concluir/`, jsonInit("POST", data)),
    linkChamado: (
      slug: string,
      id: string,
      data: { kind: "issue" | "intake"; issue_id: string }
    ): Promise<LigacaoDetalhe> => req(`${ligacao(slug, id)}/chamado/`, jsonInit("POST", data)),
    historico: (slug: string, sessionId: string): Promise<{ results: ItemDoHistorico[] }> =>
      req(`/workspaces/${slug}/sessions/${sessionId}/historico-do-cliente/`),
    config: (slug: string): Promise<TelefoniaConfig> => req(`${telefonia(slug)}/`),
    generateToken: (slug: string): Promise<{ token: string; token_last4: string }> =>
      req(`${telefonia(slug)}/token/`, jsonInit("POST")),
    revokeToken: (slug: string): Promise<{ has_token: boolean }> =>
      req(`${telefonia(slug)}/token/`, jsonInit("DELETE")),
    saveRamais: (slug: string, ramais: RamalConfigurado[]): Promise<TelefoniaConfig> =>
      req(`${telefonia(slug)}/ramais/`, jsonInit("PUT", { ramais })),
    report: (slug: string, days = 30): Promise<RelatorioDeLigacoes> =>
      req(`/workspaces/${slug}/reports/ligacoes/?days=${days}`),
  };
}

export type LigacoesApi = ReturnType<typeof ligacoesApi>;
