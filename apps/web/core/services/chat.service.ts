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
  status: string;
  assigned_attendant_id: string | null;
  requested_attendant_id?: string | null;
  project_id?: string | null;
  project_identifier?: string | null;
  project_name?: string | null;
  last_client_message_at: string | null;
  client_last_read_at?: string | null;
  rating_score?: number | null;
  rating_comment?: string | null;
  rating_state?: string | null;
  created_at: string;
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
  created_at: string;
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

  async updateConfig(workspaceSlug: string, data: Partial<ChatConfig>): Promise<ChatConfig> {
    return this.patch(`/api/workspaces/${workspaceSlug}/chat-config/`, data)
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }
}

// ── Direct chat-backend helpers (use the configured api_url) ──────────────────

export function chatApi(apiUrl: string) {
  const base = apiUrl.replace(/\/$/, "");
  const req = async (path: string, init?: RequestInit) => {
    const res = await fetch(base + path, { credentials: "include", ...init });
    if (!res.ok) throw await res.json().catch(() => ({ detail: res.statusText }));
    return res.json();
  };
  return {
    base,
    listSessions: (slug: string, status?: string, busca?: string): Promise<{ results: ChatSession[] }> => {
      // `q` vai ao servidor porque a aba de encerrados passou a trazer só o dia
      // corrente: sem isso, procurar um protocolo de ontem não acharia nada.
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (busca?.trim()) params.set("q", busca.trim());
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
    slaReport: (slug: string, days = 30): Promise<SlaReport> => req(`/workspaces/${slug}/reports/sla/?days=${days}`),
  };
}

function jsonPost(data: any): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) };
}
function jsonPatch(data: any): RequestInit {
  return { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) };
}
