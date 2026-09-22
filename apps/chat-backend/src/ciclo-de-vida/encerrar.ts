/**
 * O caminho ÚNICO de encerramento de uma conversa: atendente, cliente, robô,
 * inatividade, pausa vencida e fim do dia passam todos por aqui.
 *
 * Antes cada um tinha a própria cópia (index.ts, timers.ts, bot/engine.ts) e
 * nenhuma dizia COMO a conversa terminou, então o relatório de abandono não
 * tinha de onde ler. Aqui a causa vira `end_kind` e, quando o cliente foi
 * embora, o tipo de abandono do SAC (`abandon_type`).
 */

import prisma from "@db";
import { CHAT_AUDIT_ACTIONS, recordChatAudit } from "@/audit";
import { type CausaDoFim, classifyAbandono } from "@/ciclo-de-vida/abandono";
import { deliverOutbound } from "@/outbound";
import { requestRating } from "@/rating";
import { sendToSession, sendToWorkspace } from "@/ws/hub";

const MENSAGEM_PADRAO = "Atendimento encerrado. Protocolo: {protocol}";

export type Encerramento = {
  sessionId: string;
  causa: CausaDoFim;
  closedById?: string | null;
  /** Texto enviado ao cliente; `{protocol}` é trocado pelo protocolo. Padrão: a mensagem configurada. */
  mensagem?: string | null;
};

const render = (texto: string, protocolo: string) => texto.replace(/\{protocol\}/g, protocolo);

async function readMensagem(workspaceId: string, mensagem?: string | null): Promise<string> {
  if (mensagem) return mensagem;
  const cfg = await prisma.botConfig.findUnique({ where: { workspaceId }, select: { closedMessage: true } });
  return cfg?.closedMessage ?? MENSAGEM_PADRAO;
}

export async function closeAtendimento({ sessionId, causa, closedById = null, mensagem }: Encerramento) {
  const antes = await prisma.chatSession.findUnique({ where: { id: sessionId } });
  if (!antes || antes.status === "closed") return null;

  const abandonType = classifyAbandono(causa, {
    status: antes.status,
    hasAttendantMessage: Boolean(antes.lastAttendantMessageAt),
  });
  // `updateMany` com o status na condição: dois encerramentos simultâneos (o
  // timer e o atendente no mesmo minuto) não mandam duas despedidas. E não lança
  // quando a sessão sumiu no meio do caminho (P2025 derrubava o processo).
  const alteradas = await prisma.chatSession.updateMany({
    where: { id: sessionId, status: { not: "closed" } },
    data: {
      status: "closed",
      closedAt: new Date(),
      closedById,
      endKind: causa,
      abandonType,
      pausedAt: null,
      idlePromptedAt: null,
    },
  });
  if (alteradas.count === 0) return null;

  const s = await prisma.chatSession.findUniqueOrThrow({ where: { id: sessionId } });
  sendToSession(sessionId, { type: "session.closed", session_id: sessionId, protocol: s.protocol });
  sendToWorkspace(s.workspaceId, { type: "session.activity", session_id: sessionId });
  recordChatAudit({
    workspaceSlug: s.workspaceId,
    sessionId,
    action: CHAT_AUDIT_ACTIONS.CLOSE,
    userId: closedById,
    metadata: { protocolo: s.protocol, canal: s.channel, causa, abandono: abandonType },
  });
  await deliverOutbound(s, {
    sender: "system",
    type: "event",
    text: render(await readMensagem(s.workspaceId, mensagem), s.protocol),
  });
  await requestRating(s).catch((e) => console.error("[requestRating]", e));
  return s;
}
