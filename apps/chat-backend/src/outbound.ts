// Single outbound path for bot + attendant messages: persist + WS broadcast, and
// for WhatsApp sessions forward to the provider. Keeps native and WhatsApp on the
// exact same pipeline (the attendant UI behaves identically for both channels).

import prisma from "@db";
import { formatTextoDoWhatsapp } from "@/atendente/whatsapp-texto";
import { persistAndBroadcast, serializeMessage, type SendArgs } from "@/messages";
import { getProvider } from "@/providers/provider";
import { attendantName } from "@/users";
import { sendToSession } from "@/ws/hub";

const PUBLIC_URL = (process.env.CHAT_PUBLIC_URL || "").replace(/\/$/, "");

const SEM_PROVEDOR = "WhatsApp não configurado ou desativado.";
const LIMITE_DO_ERRO = 500;

export type ChatSessionLike = {
  id: string;
  workspaceId: string;
  channel: string;
  clientPhone?: string | null;
};

type Mensagem = Awaited<ReturnType<typeof persistAndBroadcast>>;

/** Manda ao WhatsApp o que já está gravado. Devolve o id do provedor. */
async function forwardToWhatsapp(session: ChatSessionLike, message: Mensagem, whatsappText: string | null) {
  const resolved = await getProvider(session.workspaceId);
  if (!resolved) throw new Error(SEM_PROVEDOR);
  if (message.mediaKey) {
    const url = PUBLIC_URL ? `${PUBLIC_URL}/media/${message.mediaKey}` : undefined;
    return resolved.provider.sendMedia(session.clientPhone!, {
      url,
      mime: message.mediaMime || "application/octet-stream",
      name: message.mediaName || undefined,
      type: message.type,
    });
  }
  if (!whatsappText) return null;
  return resolved.provider.sendText(session.clientPhone!, whatsappText);
}

/** O atendente precisa ver na hora que a mensagem não chegou, e poder reenviar. */
function broadcastStatus(message: Mensagem) {
  sendToSession(
    message.sessionId,
    { type: "message.status", message: serializeMessage(message, { full: true }) },
    "attendant"
  );
}

/**
 * Tenta a entrega e grava o resultado na própria mensagem: `sent` com o id do
 * provedor (sem ele não há como editar/apagar no WhatsApp depois) ou `failed`
 * com o motivo. Antes a falha só ia para o log e o atendente achava que o
 * cliente tinha recebido.
 */
async function deliverToWhatsapp(
  session: ChatSessionLike,
  message: Mensagem,
  whatsappText: string | null
): Promise<Mensagem> {
  try {
    const externalId = await forwardToWhatsapp(session, message, whatsappText);
    const houveFalha = message.status === "failed";
    if (!externalId && !houveFalha) return message;
    const salva = await prisma.chatMessage.update({
      where: { id: message.id },
      data: { status: "sent", sendError: null, ...(externalId ? { externalId } : {}) },
    });
    if (houveFalha) broadcastStatus(salva);
    return salva;
  } catch (e) {
    console.error("[outbound] WhatsApp forward failed:", e);
    const motivo = (e instanceof Error ? e.message : String(e)).slice(0, LIMITE_DO_ERRO);
    const falhou = await prisma.chatMessage.update({
      where: { id: message.id },
      data: { status: "failed", sendError: motivo },
    });
    broadcastStatus(falhou);
    return falhou;
  }
}

const isWhatsapp = (session: ChatSessionLike) => session.channel === "whatsapp" && Boolean(session.clientPhone);

/**
 * O texto do WhatsApp para a mensagem gravada: nome do atendente em negrito no
 * começo (o WhatsApp não tem rótulo de remetente), salvo quando ele pediu para
 * enviar sem o nome. O corpo por tipo fica em src/atendente/whatsapp-texto.ts.
 */
async function buildTextoDoWhatsapp(m: {
  sender: string;
  senderUserId?: string | null;
  type: string;
  text: string | null;
  withoutSenderName?: boolean;
}) {
  const levaNome = m.sender === "attendant" && Boolean(m.senderUserId) && !m.withoutSenderName;
  const nome = levaNome ? await attendantName(m.senderUserId) : null;
  return formatTextoDoWhatsapp({ type: m.type, text: m.text, nome });
}

export async function deliverOutbound(session: ChatSessionLike, args: Omit<SendArgs, "sessionId">) {
  // Every attendant message MUST carry the attendant's name. Native renders it as
  // a label (sender_name); WhatsApp gets it prefixed in the body.
  const senderName =
    args.senderName ??
    (args.sender === "attendant" && args.senderUserId ? await attendantName(args.senderUserId) : null);
  const message = await persistAndBroadcast({ ...args, senderName, sessionId: session.id });
  if (!isWhatsapp(session)) return message;
  return deliverToWhatsapp(session, message, await buildTextoDoWhatsapp(message));
}

/** Reenvia uma mensagem que falhou. Nula quando a mensagem não existe ou não falhou. */
export async function resendMessage(messageId: string) {
  const message = await prisma.chatMessage.findUnique({ where: { id: messageId }, include: { session: true } });
  if (!message || message.status !== "failed" || !isWhatsapp(message.session)) return null;
  const { session, ...semSessao } = message;
  return deliverToWhatsapp(session, semSessao, await buildTextoDoWhatsapp(semSessao));
}
