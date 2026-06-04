// Message persistence + broadcast. Every message (incl. bot/system events) is
// saved to chat_messages and pushed over WS to the session participants and the
// assigned attendant. Clients never poll — this is the single source of realtime.

import prisma from "@db";
import { sendToSession, sendToUser, sendToWorkspace } from "@/ws/hub";

export type SendArgs = {
  sessionId: string;
  sender: "client" | "bot" | "attendant" | "system";
  type?: "text" | "image" | "video" | "audio" | "file" | "event";
  text?: string | null;
  senderUserId?: string | null;
  senderName?: string | null;
  mediaKey?: string | null;
  mediaMime?: string | null;
  mediaName?: string | null;
  replyToId?: string | null;
  externalId?: string | null;
};

/**
 * Serialize a message for transport.
 *  - `full` (staff view): keeps the original text/media of deleted messages and
 *    exposes the edit history. Clients (full=false) get a redacted payload:
 *    deleted → text/media null; edit history is never sent.
 */
export function serializeMessage(m: any, opts: { full?: boolean } = {}) {
  const full = opts.full ?? false;
  const deleted = !!m.deletedAt;
  const redact = deleted && !full;
  return {
    id: m.id,
    session_id: m.sessionId,
    sender: m.sender,
    sender_user_id: m.senderUserId ?? null,
    sender_name: m.senderName ?? null,
    type: m.type,
    text: redact ? null : m.text,
    media_key: redact ? null : m.mediaKey,
    media_mime: m.mediaMime,
    media_name: m.mediaName,
    reply_to_id: m.replyToId ?? null,
    edited_at: m.editedAt ?? null,
    edit_history: full ? (m.editHistory ?? []) : undefined,
    deleted_at: m.deletedAt ?? null,
    status: m.status,
    created_at: m.createdAt,
  };
}

/** Persist a message and broadcast `message.new` to the session + workspace. */
export async function persistAndBroadcast(args: SendArgs) {
  const message = await prisma.chatMessage.create({
    data: {
      sessionId: args.sessionId,
      sender: args.sender,
      type: args.type ?? "text",
      text: args.text ?? null,
      senderUserId: args.senderUserId ?? null,
      senderName: args.senderName ?? null,
      mediaKey: args.mediaKey ?? null,
      mediaMime: args.mediaMime ?? null,
      mediaName: args.mediaName ?? null,
      replyToId: args.replyToId ?? null,
      externalId: args.externalId ?? null,
    },
  });

  // Touch the session's last-activity timestamps for SLA/idle tracking.
  const session = await prisma.chatSession.update({
    where: { id: args.sessionId },
    data:
      args.sender === "attendant"
        ? { lastAttendantMessageAt: message.createdAt }
        : args.sender === "client"
          ? { lastClientMessageAt: message.createdAt }
          : {},
    select: { workspaceId: true },
  });

  const payload = { type: "message.new", message: serializeMessage(message) };
  sendToSession(args.sessionId, payload);
  // Also fan out to the workspace so attendant list views update live.
  sendToWorkspace(session.workspaceId, { type: "session.activity", session_id: args.sessionId });
  return message;
}

/** Edit: staff see the full new text + history; clients see the new text only. */
export function broadcastMessageEdit(sessionId: string, message: any) {
  sendToSession(sessionId, { type: "message.edit", message: serializeMessage(message, { full: true }) }, "attendant");
  sendToSession(sessionId, { type: "message.edit", message: serializeMessage(message, { full: false }) }, "client");
}
/** Delete: staff keep the original (struck-through); clients see it redacted. */
export function broadcastMessageDelete(sessionId: string, message: any) {
  sendToSession(sessionId, { type: "message.delete", message: serializeMessage(message, { full: true }) }, "attendant");
  sendToSession(sessionId, { type: "message.delete", message_id: message.id }, "client");
}

export { sendToSession, sendToUser, sendToWorkspace };
