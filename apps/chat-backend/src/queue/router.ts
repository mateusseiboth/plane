// Weighted queue routing. Attendants with more active chats and more chats today
// get a LOWER weight (lower chance); higher weight = higher chance. Only online
// (WS-connected + within schedule + not invisible) attendants are eligible.
//
// Fallback: if the target queue has no configured members, route to ANY online
// attendant in the workspace so conversations are never permanently stuck.

import prisma from "@db";
import { availableAttendants, isWithinBusinessHours } from "@/presence";
import { persistAndBroadcast, sendToSession, sendToUser, sendToWorkspace } from "@/messages";
import { connectedUserIds } from "@/ws/hub";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function weightFor(workspaceId: string, userId: string, alpha: number, beta: number): Promise<number> {
  const [activeChats, todayCount] = await Promise.all([
    prisma.chatSession.count({ where: { workspaceId, assignedAttendantId: userId, status: "active" } }),
    prisma.chatSession.count({ where: { workspaceId, assignedAttendantId: userId, createdAt: { gte: startOfToday() } } }),
  ]);
  return 1 / (1 + alpha * activeChats + beta * todayCount);
}

function roulettePick(weighted: { userId: string; weight: number }[]): string | null {
  const total = weighted.reduce((s, w) => s + w.weight, 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const w of weighted) {
    r -= w.weight;
    if (r <= 0) return w.userId;
  }
  return weighted[weighted.length - 1]?.userId ?? null;
}

/**
 * Try to assign a queued session to the best available attendant.
 * 1. Try queue members first.
 * 2. If queue has no members (or no queueId), fall back to any online attendant.
 * Returns the userId if assigned, or null if nobody is available.
 */
export async function routeQueuedSession(sessionId: string): Promise<string | null> {
  const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
  if (!session || session.status !== "queued") return null;

  // Outside company business hours → don't route.
  if (!(await isWithinBusinessHours(session.workspaceId))) return null;

  const cfg = await prisma.botConfig.findUnique({ where: { workspaceId: session.workspaceId } });
  const alpha = cfg?.routingAlpha ?? 1;
  const beta = cfg?.routingBeta ?? 0.5;

  // Build candidate list: queue members first, then all connected attendants.
  let candidateIds: string[] = [];

  if (session.queueId) {
    const members = await prisma.queueMember.findMany({
      where: { queueId: session.queueId },
      select: { userId: true },
    });
    candidateIds = members.map((m) => m.userId);
  }

  // If queue has no members, fall back to ANY connected attendant.
  if (candidateIds.length === 0) {
    candidateIds = Array.from(connectedUserIds(session.workspaceId));
  }

  if (candidateIds.length === 0) return null;

  const available = await availableAttendants(session.workspaceId, candidateIds);
  if (available.length === 0) return null;

  const weighted = await Promise.all(
    available.map(async (userId) => ({ userId, weight: await weightFor(session.workspaceId, userId, alpha, beta) }))
  );
  const chosen = roulettePick(weighted);
  if (!chosen) return null;

  await prisma.chatSession.update({
    where: { id: sessionId },
    data: { assignedAttendantId: chosen, status: "active" },
  });

  sendToUser(chosen, { type: "session.assigned", session_id: sessionId });
  sendToSession(sessionId, { type: "session.assigned", session_id: sessionId, attendant_id: chosen });
  sendToWorkspace(session.workspaceId, { type: "session.activity", session_id: sessionId });
  await persistAndBroadcast({ sessionId, sender: "system", type: "event", text: "Atendimento iniciado." });
  return chosen;
}

/**
 * When an attendant connects, drain any queued sessions that haven't been picked up.
 */
export async function drainQueuesForWorkspace(workspaceId: string) {
  const queued = await prisma.chatSession.findMany({
    where: { workspaceId, status: "queued" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  for (const s of queued) {
    await routeQueuedSession(s.id);
  }
}
