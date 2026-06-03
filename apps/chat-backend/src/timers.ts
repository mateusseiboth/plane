// Background timers:
//  - SLA: active sessions where the client is waiting >10min for the attendant
//    → push alert.sla to the assigned attendant (UI plays sound + red borders).
//  - Idle bot: clients that arrived at the bot and went quiet → prompt at 10min,
//    auto-close at 20min.

import prisma from "@db";
import { deliverOutbound } from "@/outbound";
import { sendToSession, sendToUser } from "@/ws/hub";

const TEN_MIN = 10 * 60 * 1000;

function render(t: string, vars: Record<string, string>): string {
  return t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

async function checkSla() {
  const active = await prisma.chatSession.findMany({
    where: { status: "active", assignedAttendantId: { not: null } },
    select: { id: true, assignedAttendantId: true, lastClientMessageAt: true, lastAttendantMessageAt: true },
  });
  const now = Date.now();
  for (const s of active) {
    if (!s.lastClientMessageAt) continue;
    const clientTs = s.lastClientMessageAt.getTime();
    const attendantTs = s.lastAttendantMessageAt?.getTime() ?? 0;
    if (clientTs > attendantTs && now - clientTs > TEN_MIN) {
      sendToUser(s.assignedAttendantId!, { type: "alert.sla", session_id: s.id, waiting_ms: now - clientTs });
      sendToSession(s.id, { type: "alert.sla", session_id: s.id, waiting_ms: now - clientTs });
    }
  }
}

async function checkIdle() {
  const sessions = await prisma.chatSession.findMany({
    where: { status: { in: ["bot", "queued"] } },
    select: { id: true, workspaceId: true, protocol: true, channel: true, clientPhone: true, createdAt: true, lastClientMessageAt: true, idlePromptedAt: true },
  });
  const now = Date.now();
  for (const s of sessions) {
    const lastActivity = (s.lastClientMessageAt ?? s.createdAt).getTime();
    if (!s.idlePromptedAt) {
      if (now - lastActivity > TEN_MIN) {
        const cfg = await prisma.botConfig.findUnique({ where: { workspaceId: s.workspaceId } });
        await deliverOutbound(s as any, { sender: "bot", type: "text", text: cfg?.idlePromptMessage ?? "Você ainda precisa de ajuda?" });
        await prisma.chatSession.update({ where: { id: s.id }, data: { idlePromptedAt: new Date() } });
      }
    } else if (now - s.idlePromptedAt.getTime() > TEN_MIN && lastActivity <= s.idlePromptedAt.getTime()) {
      // prompted, still silent 10min later → close
      const cfg = await prisma.botConfig.findUnique({ where: { workspaceId: s.workspaceId } });
      await prisma.chatSession.update({ where: { id: s.id }, data: { status: "closed", closedAt: new Date() } });
      sendToSession(s.id, { type: "session.closed", session_id: s.id, protocol: s.protocol });
      await deliverOutbound(s as any, {
        sender: "system",
        type: "event",
        text: render(cfg?.idleCloseMessage ?? "Atendimento encerrado por inatividade. Protocolo: {protocol}", { protocol: s.protocol }),
      });
    }
  }
}

export function startTimers() {
  setInterval(() => {
    checkSla().catch((e) => console.error("[timers] sla", e));
    checkIdle().catch((e) => console.error("[timers] idle", e));
  }, 60_000);
}
