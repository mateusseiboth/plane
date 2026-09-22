/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Ferramentas do atendente e da gestão no chat-backend (src/atendente/rotas.ts):
// frases prontas, chave de acesso, alerta de cliente sem resposta, cadastro da
// conversa, WhatsApp a partir do responsável, feriados, gerenciador e monitor.
// Contrato em .claude/chat-atendente.md.

import { buildQuery, chatRequest, type ChatMessage, type ChatSession } from "@/services/chat.service";

export type FrasePronta = { id: string; texto: string; ordem: number };

export type Feriado = { date: string; label: string; recorrente: boolean };

export type CampoComErro = { path: string; message: string };

/** Erro do chat-backend: `detail` para o toast, `errors` para cada campo. */
export type ErroDoChat = { detail?: string; errors?: CampoComErro[]; session_id?: string };

export type CadastroDaConversa = {
  session: ChatSession;
  entity: { id: string; name: string } | null;
  project: { id: string; identifier: string | null; name: string | null } | null;
  responsavel: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    photo: string | null;
    entity_id: string | null;
    entity_name: string | null;
  } | null;
};

export type MudancaDoCadastro = { entity_id?: string; project_id?: string; entity_contact_id?: string };

export type FiltroDoGerenciador = {
  attendant_id?: string;
  entity_id?: string;
  project_id?: string;
  from?: string;
  to?: string;
  q?: string;
  channel?: string;
  status?: string;
  page?: string;
  per_page?: string;
};

export type LinhaDoGerenciador = {
  id: string;
  protocol: string;
  channel: string;
  status: string;
  client_name: string | null;
  client_phone: string | null;
  entity_id: string | null;
  entity_name: string | null;
  project_id: string | null;
  project_name: string | null;
  attendant_id: string | null;
  attendant_name: string | null;
  close_reason: string | null;
  abandonado: boolean;
  abandono: string | null;
  issue_label: string | null;
  duracao_seg: number | null;
  created_at: string;
  closed_at: string | null;
};

export type PaginaDoGerenciador = {
  count: number;
  page: number;
  per_page: number;
  total_pages: number;
  results: LinhaDoGerenciador[];
};

export type ResumoDeTempo = { min: number | null; media: number | null; max: number | null; amostras: number };

export type Monitor = {
  gerado_em: string;
  fila: {
    id: string;
    protocol: string;
    status: string;
    channel: string;
    client_name: string | null;
    project_name: string | null;
    espera_seg: number;
  }[];
  ativos: {
    id: string;
    protocol: string;
    status: string;
    channel: string;
    client_name: string | null;
    project_name: string | null;
    attendant_id: string | null;
    attendant_name: string | null;
    parado_seg: number;
    aguardando: "atendente" | "cliente";
    alerta_pausado: boolean;
  }[];
  hoje: {
    encerrados: number;
    finalizados: number;
    abandonados: number;
    por_tipo_abandono: { tipo: number | null; rotulo: string; total: number }[];
  };
  tempos: { fila: ResumoDeTempo; atendimento: ResumoDeTempo; resposta: ResumoDeTempo };
};

const json = (method: string, data?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: data === undefined ? undefined : JSON.stringify(data),
});

export function atendenteApi(apiUrl: string) {
  const req = chatRequest(apiUrl);
  return {
    frases: (slug: string): Promise<{ results: FrasePronta[] }> => req(`/workspaces/${slug}/frases/`),
    createFrase: (slug: string, data: { texto: string; ordem?: number }): Promise<FrasePronta> =>
      req(`/workspaces/${slug}/config/frases/`, json("POST", data)),
    updateFrase: (slug: string, id: string, data: { texto?: string; ordem?: number }): Promise<FrasePronta> =>
      req(`/workspaces/${slug}/config/frases/${id}/`, json("PATCH", data)),
    deleteFrase: (slug: string, id: string) => req(`/workspaces/${slug}/config/frases/${id}/`, { method: "DELETE" }),
    seedFrasesPadrao: (slug: string): Promise<{ results: FrasePronta[] }> =>
      req(`/workspaces/${slug}/config/frases/padrao/`, { method: "POST" }),

    sendChave: (slug: string, sessionId: string, chave: string, withoutSenderName: boolean): Promise<ChatMessage> =>
      req(
        `/workspaces/${slug}/sessions/${sessionId}/chave/`,
        json("POST", { chave, without_sender_name: withoutSenderName })
      ),
    pauseAlerta: (slug: string, sessionId: string): Promise<ChatSession> =>
      req(`/workspaces/${slug}/sessions/${sessionId}/sla-alert/pause/`, { method: "POST" }),
    resumeAlerta: (slug: string, sessionId: string): Promise<ChatSession> =>
      req(`/workspaces/${slug}/sessions/${sessionId}/sla-alert/resume/`, { method: "POST" }),
    cadastro: (slug: string, sessionId: string): Promise<CadastroDaConversa> =>
      req(`/workspaces/${slug}/sessions/${sessionId}/cadastro/`),
    updateCadastro: (slug: string, sessionId: string, data: MudancaDoCadastro): Promise<CadastroDaConversa> =>
      req(`/workspaces/${slug}/sessions/${sessionId}/cadastro/`, json("PATCH", data)),
    startWhatsappDoResponsavel: (
      slug: string,
      data: { entity_contact_id: string; project_id?: string; message?: string }
    ): Promise<ChatSession> => req(`/workspaces/${slug}/sessions/whatsapp/responsavel/`, json("POST", data)),

    feriados: (slug: string): Promise<{ results: Feriado[] }> => req(`/workspaces/${slug}/config/feriados/`),
    saveFeriados: (slug: string, feriados: Feriado[]): Promise<{ results: Feriado[] }> =>
      req(`/workspaces/${slug}/config/feriados/`, json("PUT", { feriados })),

    gerenciador: (slug: string, filtro: FiltroDoGerenciador): Promise<PaginaDoGerenciador> =>
      req(`/workspaces/${slug}/gerenciador/${buildQuery(filtro)}`),
    monitor: (slug: string): Promise<Monitor> => req(`/workspaces/${slug}/monitor/`),
  };
}

export type AtendenteApi = ReturnType<typeof atendenteApi>;
