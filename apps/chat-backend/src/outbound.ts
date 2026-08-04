// Single outbound path for bot + attendant messages: persist + WS broadcast, and
// for WhatsApp sessions forward to the provider. Keeps native and WhatsApp on the
// exact same pipeline (the attendant UI behaves identically for both channels).

import prisma from "@db";
import { persistAndBroadcast, type SendArgs } from "@/messages";
import { getProvider } from "@/providers/provider";
import { attendantName } from "@/users";

const PUBLIC_URL = (process.env.CHAT_PUBLIC_URL || "").replace(/\/$/, "");

export type ChatSessionLike = {
  id: string;
  workspaceId: string;
  channel: string;
  clientPhone?: string | null;
};

export async function deliverOutbound(session: ChatSessionLike, args: Omit<SendArgs, "sessionId">) {
  // Every attendant message MUST carry the attendant's name. Native renders it as
  // a label (sender_name); WhatsApp has no such UI, so we prefix the body inline
  // as "*Name*:\n<text>" (single asterisks = bold on WhatsApp).
  let senderName = args.senderName ?? null;
  let whatsappText = args.text ?? null;
  if (args.sender === "attendant" && args.senderUserId) {
    const name = await attendantName(args.senderUserId);
    senderName = senderName ?? name;
    if (whatsappText) whatsappText = `*${name}*:\n${whatsappText}`;
  }

  const message = await persistAndBroadcast({ ...args, senderName, sessionId: session.id });

  if (session.channel === "whatsapp" && session.clientPhone) {
    try {
      const resolved = await getProvider(session.workspaceId);
      if (resolved) {
        let externalId: string | null = null;
        if (message.mediaKey) {
          const url = PUBLIC_URL ? `${PUBLIC_URL}/media/${message.mediaKey}` : undefined;
          externalId = await resolved.provider.sendMedia(session.clientPhone, {
            url,
            mime: message.mediaMime || "application/octet-stream",
            name: message.mediaName || undefined,
            type: message.type,
          });
        } else if (whatsappText) {
          externalId = await resolved.provider.sendText(session.clientPhone, whatsappText);
        }
        // Guardar o id do provedor é o que torna possível editar/apagar a
        // mensagem no WhatsApp depois (a Z-API exige o messageId original).
        if (externalId) {
          await prisma.chatMessage.update({ where: { id: message.id }, data: { externalId } });
          message.externalId = externalId;
        }
      }
    } catch (e) {
      console.error("[outbound] WhatsApp forward failed:", e);
    }
  }
  return message;
}
