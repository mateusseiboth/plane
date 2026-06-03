// Availability:
//  - the company is within its (global) business hours and not on a break, AND
//  - the attendant is connected on the WS hub AND not marked invisible by an admin.
// Business hours are workspace-wide (BotConfig.businessHours/businessBreaks), not
// per-attendant.

import prisma from "@db";
import { connectedUserIds } from "@/ws/hub";

type Window = { weekday: number | string; start_time: string; end_time: string };

function nowParts(): { weekday: number; minutes: number } {
  const now = new Date();
  return { weekday: now.getDay(), minutes: now.getHours() * 60 + now.getMinutes() };
}
function toMinutes(hhmm: string): number {
  const [h, m] = (hhmm || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Is the company currently open (within a business-hours window, not on a break)? */
export async function isWithinBusinessHours(workspaceId: string): Promise<boolean> {
  const cfg = await prisma.botConfig.findUnique({ where: { workspaceId } });
  const hours = ((cfg?.businessHours as Window[]) ?? []).filter(Boolean);
  // Not configured → always open.
  if (hours.length === 0) return true;
  const { weekday, minutes } = nowParts();
  const todays = hours.filter((h) => Number(h.weekday) === weekday);
  if (todays.length === 0) return false;
  const open = todays.some((h) => minutes >= toMinutes(h.start_time) && minutes < toMinutes(h.end_time));
  if (!open) return false;
  const breaks = ((cfg?.businessBreaks as Window[]) ?? []).filter((b) => Number(b.weekday) === weekday);
  return !breaks.some((b) => minutes >= toMinutes(b.start_time) && minutes < toMinutes(b.end_time));
}

/** Attendant ids that are connected to the WS AND not marked invisible. */
export async function availableAttendants(workspaceId: string, candidateUserIds: string[]): Promise<string[]> {
  const connected = connectedUserIds(workspaceId);
  let invisible = new Set<string>();
  try {
    const rows = await (prisma as any).attendantStatus.findMany({ where: { workspaceId, isInvisible: true }, select: { userId: true } });
    invisible = new Set(rows.map((s: any) => s.userId));
  } catch {
    // attendantStatus table may not exist yet if migration hasn't run — treat everyone as visible.
  }
  return candidateUserIds.filter((id) => connected.has(id) && !invisible.has(id));
}
