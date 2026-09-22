/**
 * Pausa do atendimento (`popChatAt_pausachat.php` do SAC).
 *
 * Ainda faz sentido com o widget em WebSocket: a conversa do site já sobrevive
 * a recarregar a página (`/sessions/active/` devolve a sessão aberta do
 * navegador), mas sem a pausa a inatividade encerraria em 20 minutos quem foi
 * buscar um documento e volta amanhã. Pausada, a conversa sai da regra de
 * inatividade; o cliente que volta a escrever retoma sozinho; quem não volta em
 * 3 dias é abandono do tipo 4.
 */

import prisma from "@db";
import { CAUSA_DO_FIM } from "@/ciclo-de-vida/abandono";
import { closeAtendimento } from "@/ciclo-de-vida/encerrar";
import { isPausaVencida } from "@/ciclo-de-vida/pausa-regras";
import { persistAndBroadcast } from "@/messages";
import { runInSequence } from "@/sequencia";
import { sendToWorkspace } from "@/ws/hub";

const AVISO_DE_PAUSA = "Atendimento em pausa. Quando puder, é só escrever aqui para continuar.";
const AVISO_DE_RETOMADA = "Atendimento retomado.";
const ENCERRAMENTO_DA_PAUSA =
  "Atendimento encerrado porque a conversa ficou em pausa por mais de 3 dias. Protocolo: {protocol}";

async function setStatus(
  sessionId: string,
  de: string,
  para: { status: string; pausedAt: Date | null },
  aviso: string
) {
  const alteradas = await prisma.chatSession.updateMany({
    where: { id: sessionId, status: de },
    data: { ...para, idlePromptedAt: null },
  });
  if (alteradas.count === 0) return false;
  const s = await prisma.chatSession.findUniqueOrThrow({ where: { id: sessionId }, select: { workspaceId: true } });
  await persistAndBroadcast({ sessionId, sender: "system", type: "event", text: aviso });
  sendToWorkspace(s.workspaceId, { type: "session.activity", session_id: sessionId });
  return true;
}

/** Só conversa em atendimento pausa. Devolve se pausou. */
export const pauseAtendimento = (sessionId: string) =>
  setStatus(sessionId, "active", { status: "paused", pausedAt: new Date() }, AVISO_DE_PAUSA);

/** Volta ao atendimento: pelo atendente ou pela mensagem do cliente. */
export const resumeAtendimento = (sessionId: string) =>
  setStatus(sessionId, "paused", { status: "active", pausedAt: null }, AVISO_DE_RETOMADA);

/** Uma passada do timer. `workspaceId` restringe a um espaço (testes). */
export async function runPausasVencidas(agora = Date.now(), workspaceId?: string) {
  const pausadas = await prisma.chatSession.findMany({
    where: { status: "paused", ...(workspaceId ? { workspaceId } : {}) },
    select: { id: true, pausedAt: true, lastClientMessageAt: true },
  });
  await runInSequence(
    pausadas.filter((p) => isPausaVencida(p, agora)),
    (s) => closeAtendimento({ sessionId: s.id, causa: CAUSA_DO_FIM.PAUSA_VENCIDA, mensagem: ENCERRAMENTO_DA_PAUSA }),
    "pausa"
  );
}
