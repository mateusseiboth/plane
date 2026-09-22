/**
 * Fim do dia (`zapi/cron.php` do SAC): no horário configurado (ou no fim do
 * expediente), as conversas de WhatsApp ainda abertas são encerradas com aviso
 * ao cliente. Só o WhatsApp: o chat do site fecha junto com a janela, e a
 * ligação (W06) não é conversa escrita.
 *
 * Idempotente sem guardar estado: só encerra o que foi aberto ANTES do corte de
 * hoje. Quem escreve depois do corte abre conversa nova e fica para o corte de
 * amanhã; reiniciar o processo não repete nada.
 */

import prisma from "@db";
import { CAUSA_DO_FIM } from "@/ciclo-de-vida/abandono";
import { closeAtendimento } from "@/ciclo-de-vida/encerrar";
import { buildCorteDoDia } from "@/ciclo-de-vida/fim-do-dia-regras";
import { readFusoDoWorkspace } from "@/presence";
import { runInSequence } from "@/sequencia";

const STATUS_ABERTOS = ["bot", "queued", "active", "paused"];

type Janela = { weekday: number | string; start_time: string; end_time: string };

async function closeDoEspaco(
  cfg: { workspaceId: string; endOfDayTime: string | null; endOfDayMessage: string; businessHours: unknown },
  agora: Date
) {
  const corte = buildCorteDoDia({
    agora,
    fuso: await readFusoDoWorkspace(cfg.workspaceId),
    horario: cfg.endOfDayTime,
    expediente: Array.isArray(cfg.businessHours) ? (cfg.businessHours as Janela[]) : [],
  });
  if (!corte) return;
  const abertas = await prisma.chatSession.findMany({
    where: {
      workspaceId: cfg.workspaceId,
      channel: "whatsapp",
      status: { in: STATUS_ABERTOS },
      createdAt: { lt: corte },
    },
    select: { id: true },
  });
  await runInSequence(
    abertas,
    ({ id }) => closeAtendimento({ sessionId: id, causa: CAUSA_DO_FIM.FIM_DO_DIA, mensagem: cfg.endOfDayMessage }),
    "fim-do-dia"
  );
}

/** Uma passada do timer. `workspaceId` restringe a um espaço (testes). */
export async function runFimDoDia(agora = new Date(), workspaceId?: string) {
  const espacos = await prisma.botConfig.findMany({
    where: { endOfDayEnabled: true, ...(workspaceId ? { workspaceId } : {}) },
    select: { workspaceId: true, endOfDayTime: true, endOfDayMessage: true, businessHours: true },
  });
  await runInSequence(espacos, (cfg) => closeDoEspaco(cfg, agora), "fim-do-dia");
}
