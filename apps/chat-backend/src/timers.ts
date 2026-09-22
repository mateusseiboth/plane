// Background timers:
//  - SLA: active sessions where the client is waiting >10min for the attendant
//    → push alert.sla to the assigned attendant (UI plays sound + red borders).
//  - Ciclo de vida (src/ciclo-de-vida/): inatividade no robô, na fila e em
//    atendimento; pausa vencida (3 dias); fim do dia do WhatsApp.

import prisma from "@db";
import { WITHOUT_PHONE } from "@/canais";
import { runFimDoDia } from "@/ciclo-de-vida/fim-do-dia";
import { runInatividade } from "@/ciclo-de-vida/inatividade";
import { runPausasVencidas } from "@/ciclo-de-vida/pausa";
import { sendToSession, sendToUser } from "@/ws/hub";

const TEN_MIN = 10 * 60 * 1000;

// Ligação (channel "phone") fica fora do SLA e da inatividade: não há cliente
// digitando do outro lado. A inatividade usa o mesmo WITHOUT_PHONE.
export async function checkSla() {
  const active = await prisma.chatSession.findMany({
    where: { status: "active", assignedAttendantId: { not: null }, ...WITHOUT_PHONE },
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

export function startTimers() {
  setInterval(() => {
    checkSla().catch((e) => console.error("[timers] sla", e));
    runInatividade().catch((e) => console.error("[timers] inatividade", e));
    runPausasVencidas().catch((e) => console.error("[timers] pausa", e));
    runFimDoDia().catch((e) => console.error("[timers] fim do dia", e));
  }, 60_000);
}
