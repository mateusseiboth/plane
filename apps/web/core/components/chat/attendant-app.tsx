/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { observer } from "mobx-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BarChart2,
  CheckCheck,
  Loader2,
  Mail,
  MessageSquare,
  History,
  Mic,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  Search,
  SendHorizontal,
  Settings2,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useProject } from "@/hooks/store/use-project";
import { useUser, useUserPermissions } from "@/hooks/store/user";
// components
import { AppSidebarToggleButton } from "@/components/sidebar/sidebar-toggle-button";
// services
import { ChatConfigPanel } from "@/components/chat/chat-config-panel";
import { ChatDashboard } from "@/components/chat/chat-dashboard";
import { ChatService, chatApi, type ChatAttendant, type ChatMessage, type ChatSession } from "@/services/chat.service";
import {SelectPesquisavel} from "@/components/common/select-pesquisavel";

const chatService = new ChatService();

// Desktop notification on inbound messages (best-effort; ignored if blocked).
function notifyDesktop(title: string, body: string) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const n = new Notification(title, { body, icon: "/favicon.ico", tag: "plane-chat" });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* ignore */
  }
}

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

// ── Transfer chat modal (admin / manager only) ───────────────────
function TransferModal({
  slug,
  api,
  session,
  onTransferred,
  onClose,
}: {
  slug: string;
  api: ReturnType<typeof chatApi>;
  session: ChatSession;
  onTransferred: () => void;
  onClose: () => void;
}) {
  const [attendants, setAttendants] = useState<ChatAttendant[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .attendants(slug)
      .then((r) => setAttendants(r.results.filter((a) => a.user_id !== session.assigned_attendant_id)))
      .catch(() => setAttendants([]))
      .finally(() => setLoading(false));
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const transfer = async (toUserId: string) => {
    setBusy(true);
    try {
      await api.transfer(slug, session.id, toUserId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Atendimento transferido", message: "O cliente foi notificado." });
      onTransferred();
    } catch (e: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: e?.detail || "Não foi possível transferir." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative mx-4 w-full max-w-md rounded-2xl border border-subtle bg-surface-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-primary">Transferir atendimento</h2>
            <p className="mt-0.5 text-12 text-secondary">#{session.protocol} — escolha o atendente</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-secondary hover:bg-layer-2 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-3">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-13 text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando atendentes…
            </div>
          )}
          {!loading && attendants.length === 0 && (
            <p className="py-8 text-center text-13 text-tertiary">Nenhum outro atendente disponível.</p>
          )}
          {!loading &&
            attendants.map((a) => (
              <button
                key={a.user_id}
                disabled={busy}
                onClick={() => transfer(a.user_id)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-layer-1 transition-colors disabled:opacity-50"
              >
                <div className="relative">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-sm font-semibold text-white">
                    {(a.name?.[0] ?? "?").toUpperCase()}
                  </div>
                  {a.online && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface-1 bg-green-500" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-13 font-medium text-primary">{a.name}</div>
                  <div className="text-11 text-tertiary">{a.online ? "Online" : "Offline"}</div>
                </div>
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

export const AttendantChatApp = observer(function AttendantChatApp() {
  const { workspaceSlug } = useParams();
  const router = useRouter();
  const slug = workspaceSlug?.toString() ?? "";
  const { data: currentUser } = useUser();
  const { allowPermissions } = useUserPermissions();
  const { joinedProjectIds, getProjectById } = useProject();
  const { sidebarCollapsed } = useAppTheme();

  const isManager = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.GESTOR_PROJETO],
    EUserPermissionsLevel.WORKSPACE
  );
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  const [showConfig, setShowConfig] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [intakeProjectId, setIntakeProjectId] = useState("");
  const [search, setSearch] = useState("");
  // Which status tab is selected (always one — clear visual indication of where you are).
  const [listFilter, setListFilter] = useState<string>("active");
  // Sessions freshly assigned to me that I haven't opened yet (new-arrival highlight).
  const [newAssigned, setNewAssigned] = useState<Set<string>>(new Set());
  // The open client is typing right now (auto-clears after a few seconds).
  const [clientTyping, setClientTyping] = useState(false);
  // Timestamp the open client has read up to → my messages before it show blue checks.
  const [clientReadAt, setClientReadAt] = useState<string | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [config, setConfig] = useState<{ api_url: string; ws_url: string; enabled: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [slaSessions, setSlaSessions] = useState<Set<string>>(new Set());
  const [recording, setRecording] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [historyFor, setHistoryFor] = useState<string | null>(null);

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
      setClientTyping(false);
      const { results, session } = await api.history(id);
      setMessages(results);
      setClientReadAt(session?.client_last_read_at ?? null);
      wsRef.current?.send(JSON.stringify({ type: "agent.open", session_id: id }));
      wsRef.current?.send(JSON.stringify({ type: "agent.read", session_id: id }));
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, unread: 0 } : s)));
      setNewAssigned((prev) => {
        if (!prev.has(id)) return prev;
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    },
    [api]
  );

  // refs so the WS handler always sees the latest active session / refresher
  const activeRef = useRef<string | null>(null);
  const refreshSessionsRef = useRef<typeof refreshSessions>();
  const sessionsRef = useRef<ChatSession[]>([]);
  useEffect(() => {
    activeRef.current = activeId;
  }, [activeId]);
  useEffect(() => {
    refreshSessionsRef.current = refreshSessions;
  }, [refreshSessions]);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  // Ask once for desktop-notification permission so inbound messages can alert
  // the attendant even when this tab is in the background.
  useEffect(() => {
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        void Notification.requestPermission();
      }
    } catch {
      /* ignore */
    }
  }, []);

  /**
   * A aviso do navegador NÃO funciona fora de HTTPS.
   *
   * Servido em http://, o navegador marca a permissão como "denied" de saída e
   * `Notification.requestPermission()` nem chega a perguntar — por isso o
   * atendente não via aviso nenhum de mensagem nova. Não é algo que dê para
   * resolver no código: depende de a instância passar a ser servida por HTTPS
   * (ou ser aberta por localhost).
   */
  const avisoDoSistemaIndisponivel =
    typeof window !== "undefined" && typeof Notification !== "undefined" && !window.isSecureContext;

  /**
   * Enquanto isso, o contador vai para o TÍTULO da aba.
   *
   * É o único canal que sobra quando a notificação do sistema está bloqueada:
   * aparece na aba e na barra de tarefas mesmo com a janela atrás de outra.
   */
  const naoLidas = sessions.reduce((total, s) => total + (s.unread ?? 0), 0);
  useEffect(() => {
    const original = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = naoLidas > 0 ? `(${naoLidas}) ${original}` : original;
    return () => {
      document.title = original;
    };
  }, [naoLidas]);

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

            // Client is typing in the open conversation → show the indicator.
            if (msg.type === "typing" && msg.who === "client") {
              if (msg.session_id === activeRef.current) {
                setClientTyping(true);
                if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
                typingTimerRef.current = setTimeout(() => setClientTyping(false), 3000);
              }
              return;
            }
            // Client read up to msg.at → my earlier messages turn blue.
            if (msg.type === "read.receipt" && msg.who === "client") {
              if (msg.session_id === activeRef.current && msg.at) setClientReadAt(msg.at);
              return;
            }

            if (msg.type === "message.new") {
              const isActive = msg.message.session_id === activeRef.current;
              if (isActive && msg.message.sender === "client") setClientTyping(false);
              if (isActive) {
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
              // Desktop notification for inbound client messages when the tab is
              // not focused or the message isn't in the open conversation.
              if (msg.message.sender === "client" && (document.hidden || !isActive)) {
                playAlert();
                const sess = sessionsRef.current.find((s) => s.id === msg.message.session_id);
                const who = sess?.client_name || sess?.client_phone || "Visitante";
                const preview =
                  msg.message.text ||
                  (msg.message.type === "image"
                    ? "📷 Imagem"
                    : msg.message.type === "audio"
                      ? "🎤 Áudio"
                      : msg.message.type === "file"
                        ? "📎 Arquivo"
                        : "Nova mensagem");
                notifyDesktop(`Nova mensagem — ${who}`, preview);
              }
              return;
            }

            if (msg.type === "message.edit")
              return setMessages((prev) => prev.map((m) => (m.id === msg.message.id ? msg.message : m)));
            if (msg.type === "message.delete")
              // Staff receive the full message (deleted_at + original text kept).
              return setMessages((prev) =>
                prev.map((m) =>
                  m.id === (msg.message?.id ?? msg.message_id)
                    ? msg.message ?? { ...m, deleted_at: new Date().toISOString(), text: null }
                    : m
                )
              );

            // A chat became assigned to me (direct route / queue pickup). The
            // backend only delivers session.assigned to the chosen attendant (or to
            // whoever has it open), so treat it as a new, unread arrival: bump the
            // unread badge, beep, and notify on the desktop when the tab is hidden.
            if (msg.type === "session.assigned") {
              void refreshSessionsRef.current?.();
              const sid = msg.session_id;
              if (sid && sid !== activeRef.current) {
                // Flag as a new arrival (survives the list refresh, which would
                // otherwise reset the backend-computed unread count to 0).
                setNewAssigned((prev) => new Set(prev).add(sid));
                playAlert();
                const sess = sessionsRef.current.find((s) => s.id === sid);
                const who = sess?.client_name || sess?.client_phone || "Visitante";
                notifyDesktop("Novo atendimento", `${who} iniciou um atendimento.`);
              }
              return;
            }

            if (
              msg.type === "session.activity" ||
              msg.type === "session.queued" ||
              msg.type === "session.closed" ||
              msg.type === "session.transferred"
            ) {
              void refreshSessionsRef.current?.();
              if (msg.type === "session.closed" && msg.session_id === activeRef.current) {
                setSessions((prev) =>
                  prev.map((s) => (s.id === msg.session_id ? { ...s, status: "closed" } : s))
                );
              }
              if (msg.type === "session.transferred") {
                playAlert();
                notifyDesktop("Atendimento transferido", "Um atendimento foi transferido para você.");
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

  const startEdit = (m: ChatMessage) => {
    setEditingId(m.id);
    setEditingText(m.text ?? "");
  };
  const saveEdit = () => {
    if (!editingId) return;
    const text = editingText.trim();
    if (text) send({ type: "agent.edit", message_id: editingId, text });
    setEditingId(null);
    setEditingText("");
  };
  const deleteMessage = (m: ChatMessage) => {
    if (!window.confirm("Apagar esta mensagem? O cliente verá 'mensagem apagada'.")) return;
    send({ type: "agent.delete", message_id: m.id });
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
    const who = activeSession.client_name || activeSession.client_phone || "Visitante";
    try {
      const res = await fetch(`/api/workspaces/${slug}/projects/${intakeProjectId}/inbox-issues/`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Chat #${activeSession.protocol} — ${who}`,
          description_html: `<p><strong>Atendimento via chat</strong> — ${who} (protocolo ${activeSession.protocol}).</p><p><a href="${chatUrl}">Ver conversa completa</a></p>`,
        }),
      });
      if (!res.ok) throw await res.json().catch(() => ({}));
      const data = await res.json().catch(() => ({}));
      const inboxIssueId = data?.id ?? data?.issue?.id;
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Intake criado", message: "Abrindo o chamado para você complementar…" });
      // Redirect to the created intake so the attendant can complete + dispatch it.
      if (inboxIssueId)
        router.push(`/${slug}/projects/${intakeProjectId}/intake?currentTab=open&inboxIssueId=${inboxIssueId}`);
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
    // Exactly the selected tab's status (closed chats live only under "Encerrados").
    const base = sessions.filter((s) => s.status === listFilter);
    if (!search.trim()) return base;
    const q = search.trim().toLowerCase();
    return base.filter(
      (s) =>
        s.client_name?.toLowerCase().includes(q) ||
        s.client_phone?.toLowerCase().includes(q) ||
        s.protocol.toLowerCase().includes(q) ||
        s.last_message?.toLowerCase().includes(q)
    );
  }, [sessions, search, listFilter]);

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
            {sidebarCollapsed && (
              <div className="shrink-0">
                <AppSidebarToggleButton />
              </div>
            )}
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

        {avisoDoSistemaIndisponivel && (
          <div
            className="border-b border-subtle bg-warning-subtle px-3 py-2 text-11 leading-snug text-warning-primary"
            title="O navegador só libera notificações do sistema em páginas HTTPS."
          >
            Avisos do sistema indisponíveis nesta conexão: o navegador só os libera em HTTPS. Enquanto isso, a contagem
            de mensagens novas aparece no título da aba e toca um alerta.
          </div>
        )}

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

        {/* Stats row — click a tab to filter; click again to clear (back to abertos). */}
        <div className="flex border-b border-subtle">
          {[
            { label: "Ativas", count: sessions.filter((s) => s.status === "active").length, status: "active" },
            // "Na fila" and "Bot" are admin-only — regular attendants never see them.
            ...(isAdmin
              ? [
                  { label: "Na fila", count: sessions.filter((s) => s.status === "queued").length, status: "queued" },
                  { label: "Bot", count: sessions.filter((s) => s.status === "bot").length, status: "bot" },
                ]
              : []),
            { label: "Encerrados", count: sessions.filter((s) => s.status === "closed").length, status: "closed" },
          ].map(({ label, count, status }) => {
            const selected = listFilter === status;
            return (
              <button
                key={status}
                onClick={() => setListFilter(status)}
                className={`relative flex flex-1 flex-col items-center gap-0.5 border-r border-subtle px-2 py-2 last:border-r-0 transition-colors ${
                  selected ? "bg-layer-1" : "hover:bg-layer-1"
                }`}
              >
                <span className={`text-base font-semibold ${selected ? "text-primary" : "text-secondary"}`}>{count}</span>
                <span className={`text-10 ${selected ? "font-semibold text-primary" : "text-tertiary"}`}>{label}</span>
                {selected && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />}
              </button>
            );
          })}
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto">
          {filteredSessions.map((s) => {
            const isUnread = (s.unread ?? 0) > 0 || newAssigned.has(s.id);
            return (
            <button
              key={s.id}
              onClick={() => openSession(s.id)}
              className={`relative flex w-full items-start gap-3 border-b border-subtle px-3 py-3 text-left transition-colors ${
                activeId === s.id
                  ? "bg-layer-1 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary"
                  : isUnread
                    ? "bg-indigo-50 hover:bg-indigo-100 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-indigo-500 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/30"
                    : "hover:bg-layer-1"
              }`}
            >
              <SessionAvatar name={s.client_name} phone={s.client_phone} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-1">
                  <span className={`truncate text-13 ${isUnread ? "font-bold text-primary" : "font-medium text-primary"}`}>
                    {s.client_name || s.client_phone || "Visitante"}
                  </span>
                  <span className={`shrink-0 text-10 ${isUnread ? "font-semibold text-indigo-600 dark:text-indigo-400" : "text-tertiary"}`}>
                    {formatDate(s.last_message_at)}
                  </span>
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
                  {s.project_identifier && (
                    <span className="rounded bg-indigo-100 px-1 py-0.5 text-9 font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                      {s.project_identifier}
                    </span>
                  )}
                  <span className="text-10 text-tertiary">#{s.protocol}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className={`truncate text-12 ${isUnread ? "font-medium text-secondary" : "text-tertiary"}`}>
                    {s.last_message || "Sem mensagens"}
                  </span>
                  {(s.unread ?? 0) > 0 ? (
                    <span className="ml-2 flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-11 font-bold text-white shadow-sm">
                      {s.unread}
                    </span>
                  ) : (
                    newAssigned.has(s.id) && (
                      <span className="ml-2 flex h-5 shrink-0 items-center rounded-full bg-red-500 px-2 text-10 font-bold uppercase tracking-wide text-white shadow-sm">
                        Novo
                      </span>
                    )
                  )}
                </div>
              </div>
            </button>
            );
          })}
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
                    {(activeSession.project_identifier || activeSession.project_name) && (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-indigo-100 px-1.5 py-0.5 text-10 font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                        {activeSession.project_identifier || activeSession.project_name}
                      </span>
                    )}
                    {slaActive && (
                      <span className="text-11 font-medium text-danger-primary">· ⚠ Aguardando resposta</span>
                    )}
                    {clientTyping && (
                      <span className="text-11 font-medium text-green-600 dark:text-green-400">· digitando…</span>
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
                <SelectPesquisavel
                  value={intakeProjectId}
                  onChange={setIntakeProjectId}
                  opcoes={(joinedProjectIds ?? []).map((pid) => ({value: pid, label: getProjectById(pid)?.name ?? pid}))}
                  opcaoVazia={{value: "", label: "Intake…"}}
                  searchPlaceholder="Buscar sistema"
                  className="w-44"
                  buttonClassName="h-8 border-subtle bg-transparent text-12 hover:bg-layer-1"
                />
                {intakeProjectId && (
                  <button
                    onClick={createIntake}
                    className="rounded-md border border-subtle px-2.5 py-1.5 text-12 text-secondary hover:bg-layer-1 transition-colors"
                  >
                    Criar
                  </button>
                )}
                {isManager && activeSession.status !== "closed" && activeSession.status !== "bot" && (
                  <button
                    onClick={() => setShowTransfer(true)}
                    className="flex items-center gap-1 rounded-md border border-subtle px-2.5 py-1.5 text-12 text-secondary hover:bg-layer-1 transition-colors"
                    title="Transferir atendimento"
                  >
                    <Users className="h-3.5 w-3.5" />
                    Transferir
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

            {/* Messages (drag a file anywhere here to send it) */}
            <div
              className="relative flex flex-1 flex-col gap-1.5 overflow-y-auto p-4"
              onDragOver={(e) => {
                if (activeSession.status === "closed") return;
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={(e) => {
                // Ignore leave events bubbling from children.
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (activeSession.status === "closed") return;
                const f = e.dataTransfer?.files?.[0];
                if (f) uploadFile(f);
              }}
            >
              {dragOver && (
                <div className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary bg-primary/10 text-primary backdrop-blur-sm">
                  <Paperclip className="h-7 w-7" />
                  <span className="text-13 font-medium">Solte para enviar</span>
                </div>
              )}
              {messages.map((m) => {
                const mine = m.sender === "attendant";
                const url = api?.mediaUrl(m.media_key, m.media_mime);
                const isTemp = m.id.startsWith("temp-");

                // System events and bot/automated messages are centered (never on
                // the client's side) so the attendant can tell them apart from what
                // the visitor actually typed.
                if (m.sender === "system" || m.sender === "bot") {
                  const isBot = m.sender === "bot";
                  return (
                    <div key={m.id} className="flex justify-center py-1">
                      <span
                        className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-1.5 text-center text-11 ${
                          isBot
                            ? "border border-subtle bg-layer-2 text-secondary"
                            : "border border-subtle bg-surface-1 text-tertiary"
                        }`}
                      >
                        {isBot && <span className="mr-1">🤖</span>}
                        {m.text}
                      </span>
                    </div>
                  );
                }

                // Deleted: clients see "mensagem apagada"; managers keep the original
                // (struck-through) for audit, regular attendants see the placeholder.
                if (m.deleted_at) {
                  const showOriginal = isManager && m.text;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} items-end gap-2`}>
                      {!mine && <SessionAvatar name={m.sender_name ?? null} phone={null} size="sm" />}
                      <div className={`flex max-w-[70%] flex-col ${mine ? "items-end" : "items-start"}`}>
                        {!mine && m.sender_name && <span className="mb-1 text-11 text-secondary">{m.sender_name}</span>}
                        <div className="flex items-center gap-2 rounded-2xl border border-dashed border-subtle bg-layer-2 px-4 py-2 text-sm italic text-tertiary">
                          {showOriginal ? (
                            <>
                              <span className="line-through">{m.text}</span>
                              <span className="not-italic rounded-full bg-layer-1 px-1.5 py-0.5 text-10 font-medium text-secondary">
                                apagada
                              </span>
                            </>
                          ) : (
                            <span className="flex items-center gap-1">
                              <Trash2 className="h-3 w-3" /> Mensagem apagada
                            </span>
                          )}
                        </div>
                        <div className={`mt-1 text-10 text-tertiary ${mine ? "text-right" : ""}`}>{formatTime(m.created_at)}</div>
                      </div>
                    </div>
                  );
                }

                const editing = editingId === m.id;
                const canEdit = mine && !isTemp && m.type === "text";
                // Read by the client? (my message is older than the client's read mark)
                const readByClient =
                  mine && !isTemp && !!clientReadAt && new Date(m.created_at).getTime() <= new Date(clientReadAt).getTime();

                return (
                  <div key={m.id} className={`group flex ${mine ? "justify-end" : "justify-start"} items-end gap-2`}>
                    {!mine && <SessionAvatar name={m.sender_name ?? null} phone={null} size="sm" />}
                    {/* Hover actions (own text messages) */}
                    {canEdit && !editing && (
                      <div className="mb-1 flex items-center gap-0.5 self-end opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => startEdit(m)}
                          className="rounded p-1 text-tertiary hover:bg-layer-2 hover:text-primary"
                          title="Editar mensagem"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => deleteMessage(m)}
                          className="rounded p-1 text-tertiary hover:bg-danger-subtle hover:text-danger-primary"
                          title="Apagar mensagem"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    <div className={`flex max-w-[70%] flex-col ${mine ? "items-end" : "items-start"}`}>
                      {!mine && m.sender_name && (
                        <span className="mb-1 text-11 text-secondary">{m.sender_name}</span>
                      )}
                      {editing ? (
                        <div className="flex w-72 flex-col gap-1.5 rounded-2xl border border-primary/40 bg-surface-1 p-2">
                          <textarea
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                saveEdit();
                              }
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            rows={2}
                            autoFocus
                            className="resize-none rounded-lg bg-layer-2 px-3 py-2 text-sm text-primary outline-none"
                          />
                          <div className="flex justify-end gap-1.5">
                            <button onClick={() => setEditingId(null)} className="rounded-md px-2.5 py-1 text-12 text-secondary hover:bg-layer-2">
                              Cancelar
                            </button>
                            <button onClick={saveEdit} className="rounded-md bg-primary px-2.5 py-1 text-12 font-medium text-on-color hover:bg-primary/90">
                              Salvar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className={`rounded-2xl px-4 py-2.5 shadow-sm ${
                            mine
                              ? `rounded-br-sm border border-indigo-600 bg-indigo-600 text-white ${isTemp ? "opacity-70" : ""}`
                              : "rounded-bl-sm border border-subtle bg-surface-1 text-primary"
                          }`}
                        >
                          {/* Teto de ALTURA, não só de largura: retrato alto passava
                              da tela inteira e empurrava a conversa para longe. */}
                          {url && m.type === "image" && (
                            <a href={url} target="_blank" rel="noreferrer" title="Abrir em tamanho real">
                              <img
                                src={url}
                                className="mb-1 max-h-56 w-auto max-w-full cursor-zoom-in rounded-xl object-contain"
                                alt={m.media_name ?? ""}
                              />
                            </a>
                          )}
                          {url && m.type === "video" && (
                            <video src={url} controls className="mb-1 max-h-56 w-auto max-w-full rounded-xl" />
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
                      )}
                      <div className={`mt-1 flex items-center gap-1 text-10 text-tertiary ${mine ? "flex-row-reverse" : ""}`}>
                        <span>{formatTime(m.created_at)}</span>
                        {mine && !isTemp && (
                          <CheckCheck className={`h-3 w-3 ${readByClient ? "text-blue-500" : ""}`} />
                        )}
                        {m.edited_at && <span className="italic">· editado</span>}
                        {isManager && (m.edit_history?.length ?? 0) > 0 && (
                          <button
                            onClick={() => setHistoryFor(historyFor === m.id ? null : m.id)}
                            className="flex items-center gap-0.5 underline hover:text-secondary"
                          >
                            <History className="h-2.5 w-2.5" /> {m.edit_history!.length} versão(ões)
                          </button>
                        )}
                      </div>
                      {/* Edit history (managers) */}
                      {historyFor === m.id && (m.edit_history?.length ?? 0) > 0 && (
                        <div className="mt-1 w-72 rounded-lg border border-subtle bg-layer-2 p-2 text-11 text-secondary">
                          <div className="mb-1 font-semibold text-tertiary">Versões anteriores</div>
                          <div className="flex flex-col gap-1">
                            {m.edit_history!.map((h, i) => (
                              <div key={i} className="border-t border-subtle pt-1 first:border-t-0 first:pt-0">
                                <span className="whitespace-pre-wrap">{h.text || "(vazio)"}</span>
                                <span className="ml-1 text-10 text-tertiary">— {formatTime(h.edited_at)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {messages.length === 0 && (
                <div className="flex flex-1 items-center justify-center text-13 text-tertiary">
                  Sem mensagens ainda.
                </div>
              )}
              {clientTyping && (
                <div className="flex items-end gap-2">
                  <SessionAvatar name={activeSession.client_name} phone={activeSession.client_phone} size="sm" />
                  <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-subtle bg-surface-1 px-4 py-3">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-tertiary" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-tertiary [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-tertiary [animation-delay:300ms]" />
                  </div>
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
              {(activeSession.project_name || activeSession.project_identifier) && (
                <div className="flex justify-between gap-2">
                  <span className="text-tertiary">Sistema</span>
                  <span className="truncate text-primary text-right">
                    {activeSession.project_name || activeSession.project_identifier}
                  </span>
                </div>
              )}
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

          {/* Satisfaction rating (after the survey) */}
          {activeSession.rating_score != null && (
            <div className="border-b border-subtle p-4">
              <div className="mb-2 text-11 font-semibold uppercase tracking-wider text-tertiary">Avaliação</div>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={`h-4 w-4 ${n <= (activeSession.rating_score ?? 0) ? "fill-current text-amber-400" : "text-tertiary"}`}
                  />
                ))}
                <span className="ml-1 text-13 font-medium text-primary">{activeSession.rating_score}/5</span>
              </div>
              {activeSession.rating_comment && (
                <p className="mt-2 rounded-lg bg-layer-2 px-3 py-2 text-12 text-secondary italic">
                  “{activeSession.rating_comment}”
                </p>
              )}
            </div>
          )}

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

      {/* ── Transfer modal ───────────────────────────────────────────── */}
      {showTransfer && api && activeSession && (
        <TransferModal
          slug={slug}
          api={api}
          session={activeSession}
          onTransferred={async () => {
            setShowTransfer(false);
            await refreshSessions();
          }}
          onClose={() => setShowTransfer(false)}
        />
      )}
    </div>
  );
});
