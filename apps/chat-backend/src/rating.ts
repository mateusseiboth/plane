// Post-service satisfaction survey (1..5 + free comment).
//
// Two flavours, same data:
//  - WhatsApp: conversational — we message the client asking for a score, then a
//    comment, parsing their replies (ratingState drives the little state machine).
//  - Native: the embeddable client renders a proper form and POSTs to /rate/.
//
// Either way we sprinkle in a random cute dog (https://random.dog) to delight the
// customer at the end of the conversation. 🐶

import prisma from "@db";
import { deliverOutbound } from "@/outbound";
import { sendToSession, sendToWorkspace } from "@/ws/hub";
import { getProvider } from "@/providers/provider";

const ASK_SCORE = "Antes de você ir: como você avalia o nosso atendimento? Responda com uma nota de *1 a 5* (sendo 5 excelente).";
const ASK_COMMENT = "Obrigado pela nota! Quer deixar um comentário sobre o atendimento? (ou responda *não* para pular)";
const THANKS = "Muito obrigado pela sua avaliação! Tenha um ótimo dia. 🐶";
const SKIP_RE = /^(n|nao|não|no|pular|skip)\b/i;

/** Fetch a random dog image/gif URL (videos filtered out). Null on failure. */
export async function randomDog(): Promise<{ url: string; mime: string } | null> {
  try {
    const res = await fetch("https://random.dog/woof.json?filter=mp4,webm,mov", {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { url?: string };
    if (!data.url) return null;
    const ext = data.url.split(".").pop()?.toLowerCase() ?? "";
    const mime =
      ext === "gif" ? "image/gif" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return { url: data.url, mime };
  } catch {
    return null;
  }
}

/** Kick off the survey right after a session is closed. */
export async function requestRating(session: any) {
  // Already rated or already asking → don't pester the client again.
  if (session.ratingScore != null || session.ratingState) return;
  await prisma.chatSession.update({
    where: { id: session.id },
    data: { ratingState: "awaiting_score", ratingRequestedAt: new Date() },
  });
  sendToSession(session.id, { type: "rating.request", session_id: session.id });

  // Native clients render their own form (driven by rating.request); only the
  // conversational WhatsApp flow needs us to send the prompt as a message.
  if (session.channel === "whatsapp") {
    await deliverOutbound(session, { sender: "bot", type: "text", text: ASK_SCORE });
  }
}

function parseScore(text: string): number | null {
  const m = text.trim().match(/[1-5]/);
  return m ? Number(m[0]) : null;
}

/** Handle a WhatsApp client reply while a survey is in progress. */
export async function handleRatingReply(session: any, text: string): Promise<boolean> {
  if (session.ratingState === "awaiting_score") {
    const score = parseScore(text);
    if (score == null) {
      await deliverOutbound(session, { sender: "bot", type: "text", text: "Por favor, responda com uma nota de 1 a 5." });
      return true;
    }
    await prisma.chatSession.update({
      where: { id: session.id },
      data: { ratingScore: score, ratingState: "awaiting_comment" },
    });
    sendToWorkspace(session.workspaceId, { type: "session.activity", session_id: session.id });
    await deliverOutbound(session, { sender: "bot", type: "text", text: ASK_COMMENT });
    return true;
  }

  if (session.ratingState === "awaiting_comment") {
    const comment = SKIP_RE.test(text.trim()) ? null : text.trim().slice(0, 1000);
    await finishRating(session, comment);
    return true;
  }

  return false;
}

/** Persist the comment, thank the client, send a dog, mark survey done. */
async function finishRating(session: any, comment: string | null) {
  await prisma.chatSession.update({
    where: { id: session.id },
    data: { ratingComment: comment, ratingState: "done" },
  });
  sendToWorkspace(session.workspaceId, { type: "session.activity", session_id: session.id });
  await deliverOutbound(session, { sender: "bot", type: "text", text: THANKS });

  // Cherry on top: a random cute dog. WhatsApp gets it as media; native clients
  // render their own (via the form), so we skip the media push for them.
  if (session.channel === "whatsapp" && session.clientPhone) {
    const dog = await randomDog();
    if (dog) {
      try {
        const resolved = await getProvider(session.workspaceId);
        await resolved?.provider.sendMedia(session.clientPhone, { url: dog.url, mime: dog.mime, type: "image" });
      } catch (e) {
        console.error("[rating] dog send failed", e);
      }
    }
  }
}

/** Store a rating submitted via REST (native client form). */
export async function submitRating(sessionId: string, score: number, comment: string | null) {
  const clamped = Math.max(1, Math.min(5, Math.round(score)));
  const session = await prisma.chatSession.update({
    where: { id: sessionId },
    data: { ratingScore: clamped, ratingComment: comment?.slice(0, 1000) || null, ratingState: "done" },
  });
  sendToWorkspace(session.workspaceId, { type: "session.activity", session_id: sessionId });
  return session;
}
