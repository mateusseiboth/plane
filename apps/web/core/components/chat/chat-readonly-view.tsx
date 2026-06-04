/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useEffect, useState } from "react";
import type { ChatMessage, ChatSession } from "@/services/chat.service";

// Read-only full view of a chat by protocol. Anyone with the link can open it.
// Talks to the chat backend through the proxy (/chat-api) — the by-protocol
// endpoint is public read-only.
export function ChatReadOnlyView({ protocol }: { protocol: string }) {
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/chat-api/sessions/by-protocol/${encodeURIComponent(protocol)}/`, { credentials: "include" });
        if (!res.ok) throw new Error("not found");
        const data = await res.json();
        setSession(data.session);
        setMessages(data.results ?? []);
      } catch {
        setError("Chat não encontrado.");
      }
    })();
  }, [protocol]);

  const mediaUrl = (key: string | null, mime?: string | null) =>
    key ? (key.startsWith("ext:") ? key.slice(4) : `/chat-api/media/${key}${mime ? `?mime=${encodeURIComponent(mime)}` : ""}`) : null;

  if (error) return <div className="p-6 text-sm text-danger-primary">{error}</div>;
  if (!session) return <div className="p-6 text-sm text-secondary">Carregando…</div>;

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col">
      <header className="border-b border-subtle p-4">
        <h1 className="text-base font-semibold">{session.client_name || session.client_phone || "Atendimento"}</h1>
        <p className="text-12 text-secondary">
          Protocolo #{session.protocol} · {session.channel === "whatsapp" ? "WhatsApp" : "Chat"} · {session.status}
        </p>
      </header>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto bg-layer-1 p-4">
        {messages.map((m) => {
          const mine = m.sender === "attendant";
          const url = mediaUrl(m.media_key, m.media_mime);
          const deleted = !!m.deleted_at;
          return (
            <div
              key={m.id}
              className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                deleted
                  ? "self-start border border-dashed border-subtle bg-transparent italic text-tertiary"
                  : mine
                    ? "self-end bg-primary text-on-color"
                    : m.sender === "system"
                      ? "self-center bg-transparent text-11 text-secondary"
                      : "self-start bg-surface-2"
              }`}
            >
              {(m.sender_name || m.sender) && m.sender !== "system" && (
                <div className="mb-0.5 text-10 opacity-60">{m.sender_name || m.sender}</div>
              )}
              {!deleted && url && m.type === "image" && <img src={url} className="max-w-full rounded" alt={m.media_name ?? ""} />}
              {!deleted && url && m.type === "video" && <video src={url} controls className="max-w-full rounded" />}
              {!deleted && url && m.type === "audio" && <audio src={url} controls />}
              {!deleted && url && m.type === "file" && (
                <a href={url} target="_blank" rel="noreferrer" className="underline">
                  {m.media_name || "Arquivo"}
                </a>
              )}
              {m.text && <span className={`whitespace-pre-wrap wrap-break-word ${deleted ? "line-through" : ""}`}>{m.text}</span>}
              {deleted && <span className="ml-2 text-10 not-italic">(apagada)</span>}
              {!deleted && m.edited_at && <span className="ml-1 text-10 opacity-60">(editado)</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
