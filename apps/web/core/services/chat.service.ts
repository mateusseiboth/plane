/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Talks to the Plane API for the chat plugin config, and to the chat backend
// (own service) for sessions/messages. Attendant auth rides the Plane cookie.

import { APIService } from "@/services/api.service";

export type ChatConfig = { enabled: boolean; api_url: string; ws_url: string };

export type ChatSession = {
  id: string;
  protocol: string;
  channel: string;
  client_name: string | null;
  client_phone: string | null;
  /** Histórico do chat (chat_contacts) — não é o cadastro do cliente. */
  contact_id?: string | null;
  contact_email?: string | null;
  contact_entity_id?: string | null;
  /** Contato (entity_contacts) identificado pelo telefone ou vinculado ao fechar. */
  entity_contact_id?: string | null;
  status: string;
  assigned_attendant_id: string | null;
  project_id?: string | null;
  project_identifier?: string | null;
  project_name?: string | null;
  last_client_message_at: string | null;
  client_last_read_at?: string | null;
  rating_score?: number | null;
  rating_comment?: string | null;
  rating_state?: string | null;
  created_at: string;
  closed_at?: string | null;
  /** Ciclo de vida: classificação do encerramento, abandono, pausa e chamado vinculado. */
  entity_id?: string | null;
  close_reason?: string | null;
  close_module_id?: string | null;
  close_module_name?: string | null;
  close_note?: string | null;
  end_kind?: string | null;
  abandon_type?: number | null;
  abandon_label?: string | null;
  paused_at?: string | null;
  issue_id?: string | null;
  issue_project_id?: string | null;
  issue_label?: string | null;
  unread?: number;
  last_message?: string;
  last_message_at?: string;
};

export type ChatAttendant = { user_id: string; name: string; online: boolean };

export type ChatMessage = {
  id: string;
  session_id: string;
  sender: "client" | "bot" | "attendant" | "system";
  sender_user_id: string | null;
  sender_name: string | null;
  type: string;
  text: string | null;
  media_key: string | null;
  media_mime: string | null;
  media_name: string | null;
  edited_at: string | null;
  edit_history?: { text: string; edited_at: string }[];
  deleted_at: string | null;
  /** sent | delivered | read | failed. `failed` = não chegou ao WhatsApp; o atendente reenvia. */
  status?: string;
  send_error?: string | null;
  created_at: string;
};

/** Destino do passo "ação" do fluxo do robô: campos que o cliente responde e parâmetros do passo. */
export type ChatDestino = {
  key: string;
  label: string;
  params: { key: string; label: string; options: { value: string; label: string }[] }[];
  campos: { key: string; label: string; prompt: string; kind: "text" | "file" }[];
};

/** Item do catálogo de tipos de motivo do encerramento (configurável). */
export type ChatMotivo = { key: string; label: string };

/** O que o atendente informa ao encerrar (`POST .../sessions/:id/close/`). */
export type DadosDoEncerramento = {
  project_id?: string;
  entity_id?: string;
  motivo?: string;
  module_id?: string;
  note?: string;
  contact?: { contact_id: string };
};

export type FiltroDeAtendimentos = {
  from?: string;
  to?: string;
  entity_id?: string;
  project_id?: string;
  motivo?: string;
};

type Contagem = { total: number; finalizados: number; abandonados: number };

export type RelatorioDeAtendimentos = {
  de: string;
  ate: string;
  finalizacao: Contagem;
  por_atendente: ({ user_id: string | null; name: string; duracao_media_min: number | null } & Contagem)[];
  por_tipo_abandono: { tipo: number | null; rotulo: string; total: number }[];
  por_sistema: ({ sistema: string } & Contagem)[];
  por_dia_da_semana: { dia: number; rotulo: string; total: number }[];
  por_motivo: { motivo: string; total: number }[];
};

export type RegistroDeAtendimento = {
  id: string;
  protocol: string;
  channel: string;
  client_name: string | null;
  entity_id: string | null;
  project_id: string | null;
  project_name: string | null;
  close_reason: string | null;
  close_module_name: string | null;
  close_note: string | null;
  abandonado: boolean;
  abandono: string | null;
  attendant_name: string | null;
  issue_id: string | null;
  issue_label: string | null;
  created_at: string;
  closed_at: string | null;
};

/** Chamado aberto a partir da conversa (`POST .../inbox-issues/from-chat/` do api-ts). */
export type NovoChamadoDoChat = {
  session_id: string;
  name?: string;
  priority: "urgent" | "none";
  module_id?: string;
  description_html?: string;
  chat_url?: string;
};

export type ChamadoDoChat = {
  id: string;
  issue: { id: string; name: string; project_id: string; sequence_id: number; label: string };
  anexos: number;
  anexos_falharam: number;
};

export type RatingsReport = {
  overall: { avg: number; count: number };
  ranking: { user_id: string; name: string; avg: number; count: number; distribution: number[] }[];
  comments: {
    protocol: string;
    client_name: string | null;
    channel: string;
    score: number | null;
    comment: string | null;
    attendant: string | null;
    closed_at: string | null;
  }[];
};

export type SlaReport = {
  days: number;
  threshold_sec: number;
  overall: SlaRow;
  ranking: ({ user_id: string; name: string } & SlaRow)[];
};

export type SlaRow = {
  count: number;
  avg_first_response_sec: number | null;
  avg_resolution_sec: number | null;
  breaches: number;
  breach_rate: number;
};

export class ChatService extends APIService {
  constructor() {
    super("");
  }

  /** Read the chat plugin config (enabled + backend URLs) from the Plane API. */
  async getConfig(workspaceSlug: string): Promise<ChatConfig> {
    return this.get(`/api/workspaces/${workspaceSlug}/chat-config/`)
      .then((r) => {
        const d = r?.data ?? {};
        // The chat always sits behind the SAME nginx proxy as the app (paths
        // /chat-api and /chat-ws). So we ALWAYS resolve against the current origin
        // and never trust a stored host — otherwise a config saved as
        // "http://localhost/chat-api" breaks the moment the app is opened from a
        // real domain (requests go to localhost → 401 / no cookie).
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const host = typeof window !== "undefined" ? window.location.host : "localhost";
        const hostname = typeof window !== "undefined" ? window.location.hostname : "localhost";
        const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
        const isLocal = hostname === "localhost" || hostname === "127.0.0.1";

        // API: same-origin proxy. Honor only a custom PATH from the stored config.
        let apiPath = "/chat-api";
        try {
          if (d.api_url) apiPath = (new URL(d.api_url, origin || "http://localhost").pathname || "/chat-api").replace(/\/$/, "") || "/chat-api";
        } catch {
          /* keep default */
        }
        const api_url = `${origin}${apiPath}`;

        // WS: on localhost dev go DIRECTLY to the backend (:8002) — nginx WS
        // proxying can loop on the HTTP Upgrade. Behind a real domain, :8002 isn't
        // exposed, so go through the proxy (/chat-ws). Always match the page scheme.
        const scheme = isHttps ? "wss" : "ws";
        let ws_url = isLocal ? `${scheme}://${hostname}:8002/ws` : `${scheme}://${host}/chat-ws`;
        if (isHttps && ws_url.startsWith("ws://")) ws_url = `wss://${ws_url.slice(5)}`;

        return {
          enabled: Boolean(d.enabled),
          api_url,
          ws_url,
        };
      })
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  /** Abre o chamado a partir da conversa, com transcrição e arquivos (api-ts). */
  async createChamadoFromChat(workspaceSlug: string, projectId: string, data: NovoChamadoDoChat): Promise<ChamadoDoChat> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/inbox-issues/from-chat/`, data)
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  async updateConfig(workspaceSlug: string, data: Partial<ChatConfig>): Promise<ChatConfig> {
    return this.patch(`/api/workspaces/${workspaceSlug}/chat-config/`, data)
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }
}

// ── Direct chat-backend helpers (use the configured api_url) ──────────────────

/** Chamada ao chat-backend com o cookie do Plane; erro vem como o JSON da resposta. */
export function chatRequest(apiUrl: string) {
  const base = apiUrl.replace(/\/$/, "");
  return async (path: string, init?: RequestInit) => {
    const res = await fetch(base + path, { credentials: "include", ...init });
    if (!res.ok) throw await res.json().catch(() => ({ detail: res.statusText }));
    return res.json();
  };
}

export function chatApi(apiUrl: string) {
  const base = apiUrl.replace(/\/$/, "");
  const req = chatRequest(apiUrl);
  return {
    base,
    listSessions: (
      slug: string,
      status?: string,
      busca?: string,
      canal?: string
    ): Promise<{ results: ChatSession[] }> => {
      // `q` vai ao servidor porque a aba de encerrados passou a trazer só o dia
      // corrente: sem isso, procurar um protocolo de ontem não acharia nada.
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (busca?.trim()) params.set("q", busca.trim());
      // `phone` (ligações) ou `whatsapp,native` (conversas).
      if (canal) params.set("channel", canal);
      const query = params.toString();
      return req(`/workspaces/${slug}/sessions/${query ? `?${query}` : ""}`);
    },
    history: (sessionId: string): Promise<{ session: ChatSession; results: ChatMessage[] }> =>
      req(`/sessions/${sessionId}/messages/`),
    upload: async (sessionId: string, file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return req(`/sessions/${sessionId}/upload/`, { method: "POST", body: fd });
    },
    startWhatsapp: (slug: string, contactId: string, message?: string) =>
      req(`/workspaces/${slug}/sessions/whatsapp/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: contactId, message }),
      }),
    attendants: (slug: string): Promise<{ results: ChatAttendant[] }> =>
      req(`/workspaces/${slug}/attendants/`),
    transfer: (slug: string, sessionId: string, toUserId: string): Promise<ChatSession> =>
      req(`/workspaces/${slug}/sessions/${sessionId}/transfer/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_user_id: toUserId }),
      }),
    contacts: (slug: string, search = ""): Promise<any[]> =>
      req(`/workspaces/${slug}/config/contacts/${search ? `?search=${encodeURIComponent(search)}` : ""}`),
    createContact: (slug: string, data: { name?: string; phone?: string; email?: string }) =>
      req(`/workspaces/${slug}/config/contacts/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    mediaUrl: (key: string | null, mime?: string | null) =>
      key ? (key.startsWith("ext:") ? key.slice(4) : `${base}/media/${key}${mime ? `?mime=${encodeURIComponent(mime)}` : ""}`) : null,

    // ── config registries (TUDO configurável) ──
    getBot: (slug: string) => req(`/workspaces/${slug}/config/bot/`),
    saveBot: (slug: string, data: any) => req(`/workspaces/${slug}/config/bot/`, jsonPatch(data)),
    listMenu: (slug: string) => req(`/workspaces/${slug}/config/menu/`),
    createMenu: (slug: string, data: any) => req(`/workspaces/${slug}/config/menu/`, jsonPost(data)),
    updateMenu: (slug: string, id: string, data: any) => req(`/workspaces/${slug}/config/menu/${id}/`, jsonPatch(data)),
    deleteMenu: (slug: string, id: string) => req(`/workspaces/${slug}/config/menu/${id}/`, { method: "DELETE" }),
    listFlows: (slug: string) => req(`/workspaces/${slug}/config/flows/`),
    createFlow: (slug: string, data: any) => req(`/workspaces/${slug}/config/flows/`, jsonPost(data)),
    updateFlow: (slug: string, id: string, data: any) => req(`/workspaces/${slug}/config/flows/${id}/`, jsonPatch(data)),
    deleteFlow: (slug: string, id: string) => req(`/workspaces/${slug}/config/flows/${id}/`, { method: "DELETE" }),
    /** Destinos do passo "ação" do robô (ouvidoria, currículo, e-mail do responsável). */
    listDestinos: (slug: string): Promise<ChatDestino[]> => req(`/workspaces/${slug}/config/bot/destinos/`),
    listQueues: (slug: string) => req(`/workspaces/${slug}/config/queues/`),
    createQueue: (slug: string, name: string) => req(`/workspaces/${slug}/config/queues/`, jsonPost({ name })),
    deleteQueue: (slug: string, id: string) => req(`/workspaces/${slug}/config/queues/${id}/`, { method: "DELETE" }),
    setQueueMembers: (slug: string, id: string, userIds: string[]) =>
      req(`/workspaces/${slug}/config/queues/${id}/members/`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_ids: userIds }) }),
    getSchedules: (slug: string, userId: string) => req(`/workspaces/${slug}/config/schedules/${userId}/`),
    saveSchedules: (slug: string, userId: string, data: any) =>
      req(`/workspaces/${slug}/config/schedules/${userId}/`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    getProvider: (slug: string) => req(`/workspaces/${slug}/config/provider/`),
    saveProvider: (slug: string, data: any) => req(`/workspaces/${slug}/config/provider/`, jsonPatch(data)),
    listAttendantStatus: (slug: string): Promise<{ user_id: string; is_invisible: boolean }[]> =>
      req(`/workspaces/${slug}/config/attendants/status/`),
    setAttendantVisibility: (slug: string, userId: string, isInvisible: boolean) =>
      req(`/workspaces/${slug}/config/attendants/${userId}/visibility/`, jsonPatch({ is_invisible: isInvisible })),
    dashboard: (
      slug: string
    ): Promise<{
      totals: { active: number; queued: number; bot: number; closed_today: number };
      online: string[];
      attendants: { user_id: string; online: boolean; invisible: boolean; active_chats: number; today_chats: number }[];
    }> => req(`/workspaces/${slug}/dashboard/`),
    ratingsReport: (slug: string): Promise<RatingsReport> => req(`/workspaces/${slug}/reports/ratings/`),

    // ── ciclo de vida (src/ciclo-de-vida/rotas.ts do chat-backend) ──
    closeSession: (slug: string, sessionId: string, dados: DadosDoEncerramento): Promise<ChatSession> =>
      req(`/workspaces/${slug}/sessions/${sessionId}/close/`, jsonPost(dados)),
    pauseSession: (slug: string, sessionId: string): Promise<ChatSession> =>
      req(`/workspaces/${slug}/sessions/${sessionId}/pause/`, { method: "POST" }),
    resumeSession: (slug: string, sessionId: string): Promise<ChatSession> =>
      req(`/workspaces/${slug}/sessions/${sessionId}/resume/`, { method: "POST" }),
    resendMessage: (slug: string, messageId: string): Promise<ChatMessage> =>
      req(`/workspaces/${slug}/messages/${messageId}/resend/`, { method: "POST" }),
    linkChamado: (slug: string, sessionId: string, issueId: string): Promise<ChatSession> =>
      req(`/workspaces/${slug}/sessions/${sessionId}/chamado/`, jsonPost({ issue_id: issueId })),
    closeReasons: (slug: string): Promise<{ results: ChatMotivo[] }> => req(`/workspaces/${slug}/close-reasons/`),

    // ── relatórios de atendimento (src/relatorios/rotas.ts do chat-backend) ──
    relatorioDeAtendimentos: (slug: string, filtro: FiltroDeAtendimentos): Promise<RelatorioDeAtendimentos> =>
      req(`/workspaces/${slug}/reports/atendimentos/${buildQuery(filtro)}`),
    registros: (
      slug: string,
      filtro: FiltroDeAtendimentos
    ): Promise<{ de: string; ate: string; limite: number; results: RegistroDeAtendimento[] }> =>
      req(`/workspaces/${slug}/registros/${buildQuery(filtro)}`),
    slaReport: (slug: string, days = 30): Promise<SlaReport> => req(`/workspaces/${slug}/reports/sla/?days=${days}`),
  };
}

/** Só os filtros preenchidos entram na URL. */
function buildQuery(filtro: FiltroDeAtendimentos): string {
  const params = new URLSearchParams(
    Object.entries(filtro).filter((par): par is [string, string] => Boolean(par[1]))
  ).toString();
  return params ? `?${params}` : "";
}

function jsonPost(data: any): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) };
}
function jsonPatch(data: any): RequestInit {
  return { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) };
}
