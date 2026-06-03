/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BarChart2,
  CheckCheck,
  Loader2,
  Mail,
  MessageSquare,
  Mic,
  Paperclip,
  Phone,
  Plus,
  Search,
  SendHorizontal,
  Settings2,
  X,
} from "lucide-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUser, useUserPermissions } from "@/hooks/store/user";
// services
import { ChatConfigPanel } from "@/components/chat/chat-config-panel";
import { ChatDashboard } from "@/components/chat/chat-dashboard";
import { ChatService, chatApi, type ChatMessage, type ChatSession } from "@/services/chat.service";

const chatService = new ChatService();

function playAlert() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.value = 0.1;
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, 350);
  } catch {
    /* ignore */
  }
}

function formatTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatDate(ts: string | undefined) {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return formatTime(ts);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  } catch {
    return "";
  }
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    active: "Ativo",
    queued: "Na fila",
    bot: "Bot",
    closed: "Encerrado",
  };
  return map[status] ?? status;
}

function statusBadgeCls(status: string) {
  const map: Record<string, string> = {
    active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    queued: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    bot: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    closed: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  };
  return map[status] ?? "bg-layer-2 text-secondary";
}

function SessionAvatar({ name, phone, size = "md" }: { name?: string | null; phone?: string | null; size?: "sm" | "md" | "lg" }) {
  const label = ((name || phone || "?")[0] ?? "?").toUpperCase();
  const sizeCls = size === "sm" ? "h-9 w-9 text-sm" : size === "lg" ? "h-12 w-12 text-lg" : "h-10 w-10";
  const hash = [...(name || phone || "A")].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const colors = [
    "bg-indigo-500",
    "bg-violet-500",
    "bg-blue-500",
    "bg-teal-500",
    "bg-emerald-500",
    "bg-pink-500",
    "bg-rose-500",
    "bg-orange-500",
  ];
  const bg = colors[hash % colors.length];
  return (
    <div className={`${sizeCls} ${bg} shrink-0 rounded-full flex items-center justify-center text-white font-semibold`}>
      {label}
    </div>
  );
}

// ── New outbound chat modal ──────────────────────────────────────
function NewChatModal({
  slug,
  api,
  onCreated,
  onClose,
}: {
  slug: string;
  api: ReturnType<typeof chatApi>;
  onCreated: (sessionId: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<any[]>([]);
  const [phone, setPhone] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!search.trim()) { setContacts([]); return; }
    setSearching(true);
    const t = setTimeout(() => {
      api
        .contacts(slug, search)
        .then(setContacts)
        .catch(() => setContacts([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [search, slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const startWithContact = async (contactId: string) => {
    setLoading(true);
    try {
      const session = await api.startWhatsapp(slug, contactId, firstMessage || undefined);
      onCreated(session.id);
    } catch (e: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: e?.detail || "Não foi possível iniciar o chat." });
    } finally {
      setLoading(false);
    }
  };

  const startWithPhone = async () => {
    if (!phone.trim()) return;
    setLoading(true);
    try {
      // Create or find contact by phone then start
      const contact = await api.createContact(slug, { phone: phone.trim() });
      const session = await api.startWhatsapp(slug, contact.id, firstMessage || undefined);
      onCreated(session.id);
    } catch (e: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: e?.detail || "Não foi possível iniciar o chat." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative mx-4 w-full max-w-md rounded-2xl border border-subtle bg-surface-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-primary">Novo atendimento</h2>
            <p className="mt-0.5 text-12 text-secondary">Busque um contato ou informe o número</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-secondary hover:bg-layer-2 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Search contacts */}
          <div>
            <label className="mb-1.5 block text-12 font-medium text-secondary">Buscar contato</label>
            <div className="flex items-center gap-2 rounded-lg border border-subtle bg-layer-2 px-3 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-tertiary" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome ou telefone..."
                className="flex-1 bg-transparent text-sm text-primary outline-none placeholder:text-tertiary"
                autoFocus
              />
              {searching && <Loader2 className="h-3.5 w-3.5 animate-spin text-tertiary" />}
            </div>
            {contacts.length > 0 && (
              <div className="mt-1.5 max-h-48 overflow-y-auto rounded-lg border border-subtle bg-surface-1 shadow-lg">
                {contacts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => !loading && startWithContact(c.id)}
                    disabled={loading}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-layer-1 transition-colors border-b border-subtle last:border-b-0"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-sm font-semibold text-white">
                      {((c.name || c.phone || "?")[0] ?? "?").toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-13 font-medium text-primary">{c.name || "Sem nome"}</div>
                      {c.phone && <div className="text-11 text-secondary">{c.phone}</div>}
                    </div>
                    <Phone className="ml-auto h-3.5 w-3.5 shrink-0 text-tertiary" />
                  </button>
                ))}
              </div>
            )}
            {search.trim() && contacts.length === 0 && !searching && (
              <p className="mt-1.5 text-12 text-tertiary">Nenhum contato encontrado.</p>
            )}
          </div>

          <div className="flex items-center gap-3 text-12 text-tertiary">
            <div className="flex-1 border-t border-subtle" />
            <span>ou</span>
            <div className="flex-1 border-t border-subtle" />
          </div>

          {/* Manual phone number */}
          <div>
            <label className="mb-1.5 block text-12 font-medium text-secondary">Número de WhatsApp</label>
            <div className="flex items-center gap-2 rounded-lg border border-subtle bg-layer-2 px-3 py-2">
              <Phone className="h-3.5 w-3.5 shrink-0 text-tertiary" />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ex: 5511999999999"
                className="flex-1 bg-transparent text-sm text-primary outline-none placeholder:text-tertiary"
              />
            </div>
            <p className="mt-1 text-11 text-tertiary">Código do país + DDD + número (sem espaços ou traços)</p>
          </div>

          {/* Optional first message */}
          <div>
            <label className="mb-1.5 block text-12 font-medium text-secondary">Mensagem inicial (opcional)</label>
            <textarea
              value={firstMessage}
              onChange={(e) => setFirstMessage(e.target.value)}
              placeholder="Olá! Como posso ajudá-lo?"
              rows={2}
              className="w-full resize-none rounded-lg border border-subtle bg-layer-2 px-3 py-2 text-sm text-primary outline-none placeholder:text-tertiary focus:border-primary/50"
            />
          </div>

          {/* Start with phone button */}
          {phone.trim() && (
            <button
              onClick={startWithPhone}
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-on-color hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
              Iniciar chat no WhatsApp
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export const AttendantChatApp = observer(function AttendantChatApp() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { data: currentUser } = useUser();
  const { allowPermissions } = useUserPermissions();
  const { joinedProjectIds, getProjectById } = useProject();

  const isManager = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.GESTOR_PROJETO],
    EUserPermissionsLevel.WORKSPACE
  );
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  const [showConfig, setShowConfig] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [intakeProjectId, setIntakeProjectId] = useState("");
  const [search, setSearch] = useState("");

  const [config, setConfig] = useState<{ api_url: string; ws_url: string; enabled: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [slaSessions, setSlaSessions] = useState<Set<string>>(new Set());
  const [recording, setRecording] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const api = useMemo(() => (config?.api_url ? chatApi(config.api_url) : null), [config?.api_url]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const refreshSessions = useCallback(async () => {
    if (!api || !slug) return;
    const { results } = await api.listSessions(slug);
    setSessions(results);
  }, [api, slug]);

  const openSession = useCallback(
    async (id: string) => {
      if (!api) return;
      setActiveId(id);
      const { results } = await api.history(id);
      setMessages(results);
      wsRef.current?.send(JSON.stringify({ type: "agent.open", session_id: id }));
      wsRef.current?.send(JSON.stringify({ type: "agent.read", session_id: id }));
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, unread: 0 } : s)));
    },
    [api]
  );

  // refs so the WS handler always sees the latest active session / refresher
  const activeRef = useRef<string | null>(null);
  const refreshSessionsRef = useRef<typeof refreshSessions>();
  useEffect(() => {
    activeRef.current = activeId;
  }, [activeId]);
  useEffect(() => {
    refreshSessionsRef.current = refreshSessions;
  }, [refreshSessions]);

  // Load config + connect the single attendant WebSocket.
  useEffect(() => {
    if (!slug) return;
    let ws: WebSocket | null = null;
    let stop = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      try {
        const cfg = await chatService.getConfig(slug);
        if (!cfg.enabled) {
          setError("O chat não está habilitado nas configurações da instância.");
          return;
        }
        setConfig(cfg);

        const a = chatApi(cfg.api_url);
        const { results } = await a.listSessions(slug);
        if (!stop) setSessions(results);

        // Fetch a short-lived WS ticket via REST (cookies work fine for REST).
        // This avoids depending on cookies being forwarded to Bun's WS upgrade path.
        const fetchTicket = async (): Promise<string | null> => {
          try {
            const r = await fetch(`${cfg.api_url}/workspaces/${encodeURIComponent(slug)}/ws-ticket/`, {
              credentials: "include",
            });
            if (!r.ok) return null;
            const d = await r.json();
            return d.ticket ?? null;
          } catch {
            return null;
          }
        };

        const connect = async () => {
          if (stop) return;
          const ticket = await fetchTicket();
          if (stop) return;

          const wsUrl =
            `${cfg.ws_url}?workspace=${encodeURIComponent(slug)}` +
            (ticket ? `&ticket=${encodeURIComponent(ticket)}` : "");

          ws = new WebSocket(wsUrl);
          wsRef.current = ws;

          ws.onopen = () => {
            // Re-subscribe to active session on (re)connect
            const cur = activeRef.current;
            if (cur) ws?.send(JSON.stringify({ type: "agent.open", session_id: cur }));
            // Refresh session list in case we missed events during disconnect
            void refreshSessionsRef.current?.();
          };

          ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.type === "ping") return ws?.send(JSON.stringify({ type: "pong" }));

            if (msg.type === "message.new") {
              if (msg.message.session_id === activeRef.current) {
                // Replace temp optimistic message if text/sender match
                setMessages((prev) => {
                  const idx = prev.findIndex(
                    (m) => m.id.startsWith("temp-") && m.text === msg.message.text && m.sender === msg.message.sender
                  );
                  if (idx >= 0) {
                    const next = [...prev];
                    next[idx] = msg.message;
                    return next;
                  }
                  return [...prev, msg.message];
                });
              } else if (msg.message.sender === "client") {
                setSessions((prev) =>
                  prev.map((s) =>
                    s.id === msg.message.session_id ? { ...s, unread: (s.unread ?? 0) + 1 } : s
                  )
                );
              }
              return;
            }

            if (msg.type === "message.edit")
              return setMessages((prev) => prev.map((m) => (m.id === msg.message.id ? msg.message : m)));
            if (msg.type === "message.delete")
              return setMessages((prev) =>
                prev.map((m) =>
                  m.id === msg.message_id ? { ...m, deleted_at: new Date().toISOString(), text: null } : m
                )
              );

            if (
              msg.type === "session.activity" ||
              msg.type === "session.assigned" ||
              msg.type === "session.queued" ||
              msg.type === "session.closed"
            ) {
              void refreshSessionsRef.current?.();
              if (msg.type === "session.closed" && msg.session_id === activeRef.current) {
                setSessions((prev) =>
                  prev.map((s) => (s.id === msg.session_id ? { ...s, status: "closed" } : s))
                );
              }
              return;
            }

            if (msg.type === "alert.sla") {
              playAlert();
              setSlaSessions((prev) => new Set(prev).add(msg.session_id));
            }
          };

          ws.onclose = (ev) => {
            // 1000 = normal closure (intentional), don't reconnect
            if (!stop && ev.code !== 1000) {
              reconnectTimer = setTimeout(() => void connect(), 3000);
            }
          };
        };

        void connect();
      } catch (e: any) {
        setError(e?.detail || "Falha ao carregar o chat.");
      }
    })();

    return () => {
      stop = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close(1000, "unmount");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const activeSession = sessions.find((s) => s.id === activeId) ?? null;
  const slaActive = activeId ? slaSessions.has(activeId) : false;
  const send = (payload: any) => wsRef.current?.send(JSON.stringify(payload));

  const handleSend = () => {
    if (!activeId || !draft.trim()) return;
    const text = draft.trim();
    // Optimistic update
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        session_id: activeId,
        sender: "attendant",
        sender_user_id: currentUser?.id ?? null,
        sender_name: null,
        type: "text",
        text,
        media_key: null,
        media_mime: null,
        media_name: null,
        edited_at: null,
        deleted_at: null,
        created_at: new Date().toISOString(),
      } as ChatMessage,
    ]);
    send({ type: "agent.message", session_id: activeId, text });
    setDraft("");
    setSlaSessions((prev) => {
      const n = new Set(prev);
      n.delete(activeId);
      return n;
    });
  };

  const assign = () => activeId && send({ type: "agent.assign", session_id: activeId });

  const closeChat = () => {
    if (!activeId) return;
    send({ type: "agent.close", session_id: activeId });
    setSessions((prev) => prev.map((s) => (s.id === activeId ? { ...s, status: "closed" } : s)));
  };

  const chatUrl = activeSession
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/${slug}/chat-view/${activeSession.protocol}`
    : "";

  const copyLink = async () => {
    if (!chatUrl) return;
    await navigator.clipboard.writeText(chatUrl).catch(() => {});
    setToast({ type: TOAST_TYPE.SUCCESS, title: "Link copiado", message: chatUrl });
  };

  const createIntake = async () => {
    if (!activeSession || !intakeProjectId) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Selecione um projeto", message: "Escolha o projeto para o intake." });
      return;
    }
    try {
      const res = await fetch(`/api/workspaces/${slug}/projects/${intakeProjectId}/inbox-issues/`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Chat #${activeSession.protocol} — ${activeSession.client_name || activeSession.client_phone || "Visitante"}`,
          description_html: `<p>Atendimento via chat. <a href="${chatUrl}">Ver conversa completa</a> (protocolo ${activeSession.protocol}).</p>`,
        }),
      });
      if (!res.ok) throw await res.json().catch(() => ({}));
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Intake criado", message: `Protocolo ${activeSession.protocol}` });
    } catch (e: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: e?.detail || "Não foi possível criar o intake." });
    }
  };

  const uploadFile = async (file: File) => {
    if (!api || !activeId) return;
    const r = await api.upload(activeId, file);
    const t = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("video/")
        ? "video"
        : file.type.startsWith("audio/")
          ? "audio"
          : "file";
    send({ type: "agent.message", session_id: activeId, media_key: r.media_key, media_mime: r.media_mime, media_name: r.media_name, media_type: t });
  };

  const toggleRecord = async () => {
    if (recRef.current && recRef.current.state === "recording") {
      recRef.current.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        uploadFile(new File([new Blob(chunks, { type: "audio/webm" })], "audio.webm", { type: "audio/webm" }));
        stream.getTracks().forEach((t) => t.stop());
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "Não foi possível acessar o microfone." });
    }
  };

  const filteredSessions = useMemo(() => {
    if (!search.trim()) return sessions;
    const q = search.trim().toLowerCase();
    return sessions.filter(
      (s) =>
        s.client_name?.toLowerCase().includes(q) ||
        s.client_phone?.toLowerCase().includes(q) ||
        s.protocol.toLowerCase().includes(q) ||
        s.last_message?.toLowerCase().includes(q)
    );
  }, [sessions, search]);

  if (error)
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <MessageSquare className="h-10 w-10 text-tertiary opacity-50" />
          <p className="text-sm text-secondary">{error}</p>
        </div>
      </div>
    );

  if (!config)
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-secondary">
        <span className="animate-spin">⟳</span> Carregando chat…
      </div>
    );

  // Full-page config / dashboard overlay
  if (showConfig || showDashboard) {
    const isDash = showDashboard;
    return (
      <div className="flex h-full w-full flex-col">
        <div className="flex items-center gap-3 border-b border-subtle bg-surface-1 px-4 py-3">
          <button
            onClick={() => {
              setShowConfig(false);
              setShowDashboard(false);
            }}
            className="flex items-center gap-1.5 rounded-md border border-subtle px-3 py-1.5 text-13 text-secondary hover:bg-layer-1 hover:text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar
          </button>
          <span className="text-sm font-semibold">{isDash ? "Dashboard de atendimento" : "Configurações do chat"}</span>
        </div>
        <div className="min-h-0 flex-1">
          {isDash ? (
            <ChatDashboard slug={slug} apiUrl={config.api_url} />
          ) : (
            <ChatConfigPanel slug={slug} apiUrl={config.api_url} isAdmin={isAdmin} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-subtle bg-surface-1">
        {/* Sidebar header */}
        <div className="flex items-center justify-between border-b border-subtle px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4.5 w-4.5 text-primary" />
            <span className="text-sm font-semibold text-primary">Atendimentos</span>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setShowNewChat(true)}
              className="rounded-md p-1.5 text-secondary hover:bg-layer-2 hover:text-primary transition-colors"
              title="Novo atendimento (ativo)"
            >
              <Plus className="h-4 w-4" />
            </button>
            {isAdmin && (
              <button
                onClick={() => setShowDashboard(true)}
                className="rounded-md p-1.5 text-secondary hover:bg-layer-2 hover:text-primary transition-colors"
                title="Dashboard de atendimento"
              >
                <BarChart2 className="h-4 w-4" />
              </button>
            )}
            {isManager && (
              <button
                onClick={() => setShowConfig(true)}
                className="rounded-md p-1.5 text-secondary hover:bg-layer-2 hover:text-primary transition-colors"
                title="Configurações do chat"
              >
                <Settings2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="border-b border-subtle px-3 py-2">
          <div className="flex items-center gap-2 rounded-lg bg-layer-2 px-3 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-tertiary" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversas..."
              className="flex-1 bg-transparent text-13 text-primary outline-none placeholder:text-tertiary"
            />
          </div>
        </div>

        {/* Stats row */}
        <div className="flex border-b border-subtle">
          {[
            { label: "Ativas", count: sessions.filter((s) => s.status === "active").length, status: "active" },
            { label: "Na fila", count: sessions.filter((s) => s.status === "queued").length, status: "queued" },
            { label: "Bot", count: sessions.filter((s) => s.status === "bot").length, status: "bot" },
          ].map(({ label, count, status }) => (
            <button
              key={status}
              onClick={() => setSearch("")}
              className="flex flex-1 flex-col items-center gap-0.5 border-r border-subtle px-2 py-2 last:border-r-0 hover:bg-layer-1 transition-colors"
            >
              <span className="text-base font-semibold text-primary">{count}</span>
              <span className="text-10 text-tertiary">{label}</span>
            </button>
          ))}
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto">
          {filteredSessions.map((s) => (
            <button
              key={s.id}
              onClick={() => openSession(s.id)}
              className={`relative flex w-full items-start gap-3 border-b border-subtle px-3 py-3 text-left hover:bg-layer-1 transition-colors ${
                activeId === s.id ? "bg-layer-1 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary" : ""
              }`}
            >
              <SessionAvatar name={s.client_name} phone={s.client_phone} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-1">
                  <span className="truncate text-13 font-medium text-primary">
                    {s.client_name || s.client_phone || "Visitante"}
                  </span>
                  <span className="shrink-0 text-10 text-tertiary">{formatDate(s.last_message_at)}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-10 font-medium ${statusBadgeCls(s.status)}`}
                  >
                    {statusLabel(s.status)}
                  </span>
                  {s.channel === "whatsapp" && (
                    <span className="flex items-center gap-0.5 text-10 text-tertiary">
                      <Phone className="h-2.5 w-2.5" />
                      WA
                    </span>
                  )}
                  <span className="text-10 text-tertiary">#{s.protocol}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between">
                  <span className="truncate text-12 text-tertiary">{s.last_message || "Sem mensagens"}</span>
                  {!!s.unread && (
                    <span className="ml-2 shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-10 font-semibold text-on-color">
                      {s.unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
          {filteredSessions.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 p-8 text-secondary">
              <MessageSquare className="h-8 w-8 opacity-30" />
              <span className="text-13">Nenhum atendimento</span>
            </div>
          )}
        </div>
      </aside>

      {/* ── Chat window ─────────────────────────────────────────────────── */}
      <section
        className={`flex min-w-0 flex-1 flex-col bg-layer-1 ${slaActive ? "ring-4 ring-danger-primary ring-inset" : ""}`}
      >
        {!activeSession ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-secondary">
            <MessageSquare className="h-12 w-12 opacity-20" />
            <span className="text-sm">Selecione um atendimento</span>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <header className="flex items-center justify-between border-b border-subtle bg-surface-1 px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <SessionAvatar name={activeSession.client_name} phone={activeSession.client_phone} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-primary">
                      {activeSession.client_name || activeSession.client_phone || "Visitante"}
                    </span>
                    {activeSession.channel === "whatsapp" && (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-10 font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        <Phone className="h-2.5 w-2.5" />
                        WhatsApp
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-11 text-tertiary">#{activeSession.protocol}</span>
                    <span className="text-tertiary">·</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-10 font-medium ${statusBadgeCls(activeSession.status)}`}>
                      {statusLabel(activeSession.status)}
                    </span>
                    {slaActive && (
                      <span className="text-11 font-medium text-danger-primary">· ⚠ Aguardando resposta</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5 ml-3">
                {activeSession.status !== "active" && activeSession.status !== "closed" && (
                  <button
                    onClick={assign}
                    className="rounded-md bg-primary px-3 py-1.5 text-12 font-medium text-on-color hover:bg-primary/90 transition-colors"
                  >
                    Assumir
                  </button>
                )}
                <button
                  onClick={copyLink}
                  className="rounded-md border border-subtle px-2.5 py-1.5 text-12 text-secondary hover:bg-layer-1 transition-colors"
                  title="Copiar link do chat"
                >
                  Link
                </button>
                <select
                  value={intakeProjectId}
                  onChange={(e) => setIntakeProjectId(e.target.value)}
                  className="rounded-md border border-subtle bg-transparent px-2 py-1.5 text-12 text-secondary hover:bg-layer-1"
                  title="Projeto para o intake"
                >
                  <option value="">Intake…</option>
                  {(joinedProjectIds ?? []).map((pid) => (
                    <option key={pid} value={pid}>
                      {getProjectById(pid)?.name ?? pid}
                    </option>
                  ))}
                </select>
                {intakeProjectId && (
                  <button
                    onClick={createIntake}
                    className="rounded-md border border-subtle px-2.5 py-1.5 text-12 text-secondary hover:bg-layer-1 transition-colors"
                  >
                    Criar
                  </button>
                )}
                {activeSession.status === "active" && (
                  <button
                    onClick={closeChat}
                    className="flex items-center gap-1 rounded-md border border-red-300 px-2.5 py-1.5 text-12 text-red-600 hover:bg-red-50 transition-colors dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                    title="Encerrar atendimento"
                  >
                    <X className="h-3.5 w-3.5" />
                    Encerrar
                  </button>
                )}
              </div>
            </header>

            {/* Queued banner — prominent call to action */}
            {activeSession.status === "queued" && (
              <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/50 dark:bg-amber-900/20">
                <div className="flex items-center gap-2 text-13 text-amber-800 dark:text-amber-400">
                  <span className="font-semibold">Aguardando atendente.</span>
                  <span className="text-amber-700 dark:text-amber-500">Clique em Assumir para iniciar o atendimento.</span>
                </div>
                <button
                  onClick={assign}
                  className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-13 font-semibold text-white hover:bg-amber-700 transition-colors"
                >
                  Assumir agora
                </button>
              </div>
            )}

            {/* Messages */}
            <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-4">
              {messages.map((m) => {
                if (m.deleted_at) return null;
                const mine = m.sender === "attendant";
                const url = api?.mediaUrl(m.media_key, m.media_mime);
                const isTemp = m.id.startsWith("temp-");

                if (m.sender === "system") {
                  return (
                    <div key={m.id} className="flex justify-center py-1">
                      <span className="rounded-full border border-subtle bg-surface-1 px-3 py-1 text-11 text-tertiary">
                        {m.text}
                      </span>
                    </div>
                  );
                }

                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} items-end gap-2`}>
                    {!mine && (
                      <SessionAvatar name={m.sender_name ?? null} phone={null} size="sm" />
                    )}
                    <div className={`flex max-w-[70%] flex-col ${mine ? "items-end" : "items-start"}`}>
                      {!mine && m.sender_name && (
                        <span className="mb-1 text-11 text-secondary">{m.sender_name}</span>
                      )}
                      <div
                        className={`rounded-2xl px-4 py-2.5 shadow-sm ${
                          mine
                            ? `rounded-br-sm bg-primary text-on-color ${isTemp ? "opacity-70" : ""}`
                            : "rounded-bl-sm border border-subtle bg-surface-1 text-primary"
                        }`}
                      >
                        {url && m.type === "image" && (
                          <img src={url} className="mb-1 max-w-full rounded-xl" alt={m.media_name ?? ""} />
                        )}
                        {url && m.type === "video" && (
                          <video src={url} controls className="mb-1 max-w-full rounded-xl" />
                        )}
                        {url && m.type === "audio" && <audio src={url} controls className="mb-1 max-w-full" />}
                        {url && m.type === "file" && (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 text-sm underline"
                          >
                            <Paperclip className="h-3.5 w-3.5 shrink-0" />
                            {m.media_name || "Arquivo"}
                          </a>
                        )}
                        {m.text && (
                          <span className="whitespace-pre-wrap text-sm wrap-break-word">{m.text}</span>
                        )}
                      </div>
                      <div className={`mt-1 flex items-center gap-1 text-10 text-tertiary ${mine ? "flex-row-reverse" : ""}`}>
                        <span>{formatTime(m.created_at)}</span>
                        {mine && !isTemp && <CheckCheck className="h-3 w-3" />}
                      </div>
                    </div>
                  </div>
                );
              })}
              {messages.length === 0 && (
                <div className="flex flex-1 items-center justify-center text-13 text-tertiary">
                  Sem mensagens ainda.
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            {activeSession.status !== "closed" && (
              <footer className="flex items-end gap-2 border-t border-subtle bg-surface-1 p-3">
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="rounded-lg p-2 text-secondary hover:bg-layer-2 hover:text-primary transition-colors"
                  title="Anexar arquivo"
                >
                  <Paperclip className="h-5 w-5" />
                </button>
                <button
                  onClick={toggleRecord}
                  className={`rounded-lg p-2 transition-colors ${recording ? "text-danger-primary hover:bg-danger-subtle" : "text-secondary hover:bg-layer-2 hover:text-primary"}`}
                  title={recording ? "Parar gravação" : "Gravar áudio"}
                >
                  <Mic className="h-5 w-5" />
                </button>
                <textarea
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    send({ type: "agent.typing", session_id: activeId });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  onPaste={(e) => {
                    const f = e.clipboardData?.files?.[0];
                    if (f) {
                      e.preventDefault();
                      uploadFile(f);
                    }
                  }}
                  placeholder="Digite sua mensagem… (Enter para enviar, Shift+Enter para nova linha)"
                  rows={1}
                  className="flex-1 resize-none rounded-xl border border-subtle bg-layer-2 px-4 py-2.5 text-sm text-primary outline-none placeholder:text-tertiary focus:border-primary/50 max-h-32 overflow-y-auto"
                />
                <button
                  onClick={handleSend}
                  disabled={!draft.trim()}
                  className="rounded-xl bg-primary p-2.5 text-on-color transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Enviar mensagem"
                >
                  <SendHorizontal className="h-5 w-5" />
                </button>
              </footer>
            )}
            {activeSession.status === "closed" && (
              <div className="flex items-center justify-center border-t border-subtle bg-surface-1 p-3">
                <span className="text-13 text-tertiary">Atendimento encerrado</span>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── Info panel ──────────────────────────────────────────────────── */}
      {activeSession && (
        <aside className="flex w-72 shrink-0 flex-col border-l border-subtle bg-surface-1 overflow-y-auto">
          {/* Contact */}
          <div className="border-b border-subtle p-4">
            <div className="mb-3 text-11 font-semibold uppercase tracking-wider text-tertiary">Cliente</div>
            <div className="flex items-center gap-3">
              <SessionAvatar name={activeSession.client_name} phone={activeSession.client_phone} size="lg" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-primary truncate">
                  {activeSession.client_name || "Visitante"}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-11 text-secondary">Online</span>
                </div>
              </div>
            </div>
          </div>

          {/* Channels */}
          <div className="border-b border-subtle p-4">
            <div className="mb-2 text-11 font-semibold uppercase tracking-wider text-tertiary">
              Canais de contato
            </div>
            <div className="flex flex-col gap-2">
              {activeSession.client_phone && (
                <div className="flex items-center gap-2 text-13">
                  <Phone className="h-3.5 w-3.5 shrink-0 text-green-600" />
                  <span className="text-primary">{activeSession.client_phone}</span>
                </div>
              )}
              {!activeSession.client_phone && !activeSession.client_name && (
                <span className="text-12 text-tertiary italic">Nenhum canal disponível</span>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="border-b border-subtle p-4">
            <div className="mb-2 text-11 font-semibold uppercase tracking-wider text-tertiary">Informações</div>
            <div className="flex flex-col gap-1.5 text-13">
              <div className="flex justify-between">
                <span className="text-tertiary">Canal</span>
                <span className="text-primary capitalize">{activeSession.channel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-tertiary">Protocolo</span>
                <span className="font-mono text-primary">#{activeSession.protocol}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-tertiary">Status</span>
                <span className={`rounded-full px-1.5 py-0.5 text-10 font-medium ${statusBadgeCls(activeSession.status)}`}>
                  {statusLabel(activeSession.status)}
                </span>
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="p-4">
            <div className="mb-2 text-11 font-semibold uppercase tracking-wider text-tertiary">Ações rápidas</div>
            <div className="flex flex-col gap-1.5">
              {activeSession.status !== "active" && activeSession.status !== "closed" && (
                <button
                  onClick={assign}
                  className="flex items-center gap-2 rounded-lg border border-subtle px-3 py-2 text-13 text-secondary hover:bg-layer-1 transition-colors text-left"
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                  Assumir atendimento
                </button>
              )}
              <button
                onClick={copyLink}
                className="flex items-center gap-2 rounded-lg border border-subtle px-3 py-2 text-13 text-secondary hover:bg-layer-1 transition-colors text-left"
              >
                <Mail className="h-3.5 w-3.5 shrink-0" />
                Copiar link do chat
              </button>
              {activeSession.status === "active" && (
                <button
                  onClick={closeChat}
                  className="flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-13 text-red-600 hover:bg-red-50 transition-colors text-left dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  <X className="h-3.5 w-3.5 shrink-0" />
                  Encerrar atendimento
                </button>
              )}
            </div>
          </div>
        </aside>
      )}

      {/* ── New chat modal ───────────────────────────────────────────── */}
      {showNewChat && api && (
        <NewChatModal
          slug={slug}
          api={api}
          onCreated={async (sessionId) => {
            setShowNewChat(false);
            await refreshSessions();
            openSession(sessionId);
          }}
          onClose={() => setShowNewChat(false)}
        />
      )}
    </div>
  );
});
