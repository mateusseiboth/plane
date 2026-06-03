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

export function serializeMessage(m: any) {
  return {
    id: m.id,
    session_id: m.sessionId,
    sender: m.sender,
    sender_user_id: m.senderUserId ?? null,
    sender_name: m.senderName ?? null,
    type: m.type,
    text: m.deletedAt ? null : m.text,
    media_key: m.deletedAt ? null : m.mediaKey,
    media_mime: m.mediaMime,
    media_name: m.mediaName,
    reply_to_id: m.replyToId ?? null,
    edited_at: m.editedAt ?? null,
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

export function broadcastMessageEdit(sessionId: string, message: any) {
  sendToSession(sessionId, { type: "message.edit", message: serializeMessage(message) });
}
export function broadcastMessageDelete(sessionId: string, messageId: string) {
  sendToSession(sessionId, { type: "message.delete", message_id: messageId });
}

export { sendToSession, sendToUser, sendToWorkspace };
