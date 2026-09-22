/**
 * Calendário de feriados da aba Horários, gravado em `chat_bot_config.holidays`.
 * Quem pergunta "está aberto?" é `isWithinBusinessHours` (src/presence.ts).
 */

import prisma from "@db";
import { requireValid } from "@/atendente/errors";
import { parseFeriados, readFeriadosGravados } from "@/atendente/feriados";

export async function readFeriados(slug: string) {
  const cfg = await prisma.botConfig.findUnique({ where: { workspaceId: slug }, select: { holidays: true } });
  return { results: readFeriadosGravados(cfg?.holidays) };
}

/** A lista é SUBSTITUÍDA inteira. */
export async function saveFeriados(slug: string, body: unknown) {
  const feriados = requireValid(parseFeriados(body));
  await prisma.botConfig.upsert({
    where: { workspaceId: slug },
    create: { workspaceId: slug, holidays: feriados },
    update: { holidays: feriados },
  });
  return { results: feriados };
}
