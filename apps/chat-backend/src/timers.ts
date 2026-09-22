// Background timers:
//  - SLA: active sessions where the client is waiting >10min for the attendant
//    → push alert.sla to the assigned attendant (UI plays sound + red borders),
//    unless the attendant paused the alert (40 min, src/atendente/alerta.ts).
//  - Ciclo de vida (src/ciclo-de-vida/): inatividade no robô, na fila e em
//    atendimento; pausa vencida (3 dias); fim do dia do WhatsApp.

import prisma from "@db";
import { WITHOUT_PHONE } from "@/canais";
import { runFimDoDia } from "@/ciclo-de-vida/fim-do-dia";
import { runInatividade } from "@/ciclo-de-vida/inatividade";
import { runPausasVencidas } from "@/ciclo-de-vida/pausa";
import { shouldAlertSla } from "@/atendente/alerta";
import { sendToUser } from "@/ws/hub";

// Ligação (channel "phone") fica fora do SLA e da inatividade: não há cliente
// digitando do outro lado. A inatividade usa o mesmo WITHOUT_PHONE.
//
// O alerta vai SÓ ao atendente. Antes ia também ao socket do cliente, que não
// tem o que fazer com ele (e ficava sabendo que a equipe estava atrasada). A
// pausa do alerta por conversa e a regra ficam em src/atendente/alerta.ts.
export async function checkSla(agora = new Date()) {
  const active = await prisma.chatSession.findMany({
    where: { status: "active", assignedAttendantId: { not: null }, ...WITHOUT_PHONE },
    select: {
      id: true,
      assignedAttendantId: true,
      lastClientMessageAt: true,
      lastAttendantMessageAt: true,
      slaAlertPausedAt: true,
    },
  });
  for (const s of active.filter((sessao) => shouldAlertSla(sessao, agora))) {
    sendToUser(s.assignedAttendantId!, {
      type: "alert.sla",
      session_id: s.id,
      waiting_ms: agora.getTime() - s.lastClientMessageAt!.getTime(),
    });
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
