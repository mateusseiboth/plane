/**
 * Relatórios e painel do atendimento, e a consulta dos registros encerrados.
 * Leitura de gestão: `chat.relatorios` em todas (o painel com os totais e quem
 * está online, as avaliações por atendente, os prazos e os atendimentos).
 */

import { Elysia } from "elysia";
import prisma from "@db";
import { authorizeChat, isNegado } from "@/acesso";
import { CHAT_ACTION } from "@/permissoes";
import { readFusoDoWorkspace } from "@/presence";
import { listRegistros, readRelatorioDeAtendimentos } from "@/relatorios/atendimentos";
import { ratingsReport, slaReport } from "@/reports";
import { connectedUserIds } from "@/ws/hub";

type Contexto = {
  params: { slug: string };
  query: Record<string, string | undefined>;
  headers: unknown;
  set: { status?: number | string };
};

const gerencial =
  (ler: (slug: string, query: Record<string, string | undefined>) => Promise<unknown>) =>
  async ({ params: { slug }, query, headers, set }: Contexto) => {
    const acesso = await authorizeChat(slug, headers, CHAT_ACTION.RELATORIOS);
    if (isNegado(acesso)) {
      set.status = acesso.status;
      return acesso.body;
    }
    return ler(slug, query ?? {});
  };

/** Painel: totais do dia e a atividade de cada atendente (online, invisível, conversas). */
async function readPainel(slug: string) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [active, queued, bot, closedToday, activeByAttendant, todayByAttendant, invisibleRows] = await Promise.all([
    prisma.chatSession.count({ where: { workspaceId: slug, status: "active" } }),
    prisma.chatSession.count({ where: { workspaceId: slug, status: "queued" } }),
    prisma.chatSession.count({ where: { workspaceId: slug, status: "bot" } }),
    prisma.chatSession.count({ where: { workspaceId: slug, status: "closed", closedAt: { gte: startOfToday } } }),
    prisma.chatSession.groupBy({
      by: ["assignedAttendantId"],
      where: { workspaceId: slug, status: "active", assignedAttendantId: { not: null } },
      _count: { _all: true },
    }),
    prisma.chatSession.groupBy({
      by: ["assignedAttendantId"],
      where: { workspaceId: slug, assignedAttendantId: { not: null }, createdAt: { gte: startOfToday } },
      _count: { _all: true },
    }),
    prisma.attendantStatus
      .findMany({ where: { workspaceId: slug, isInvisible: true }, select: { userId: true } })
      .catch(() => [] as Array<{ userId: string }>),
  ]);

  const online = Array.from(connectedUserIds(slug));
  const invisible = new Set(invisibleRows.map((r) => r.userId));
  const activeMap = new Map(activeByAttendant.map((g) => [g.assignedAttendantId as string, g._count._all]));
  const todayMap = new Map(todayByAttendant.map((g) => [g.assignedAttendantId as string, g._count._all]));
  const userIds = new Set<string>([...online, ...activeMap.keys(), ...todayMap.keys(), ...invisible]);

  const attendants = Array.from(userIds).map((userId) => ({
    user_id: userId,
    online: online.includes(userId),
    invisible: invisible.has(userId),
    active_chats: activeMap.get(userId) ?? 0,
    today_chats: todayMap.get(userId) ?? 0,
  }));

  return { totals: { active, queued, bot, closed_today: closedToday }, online, attendants };
}

const readDias = (query: Record<string, string | undefined>) => Math.min(365, Math.max(1, Number(query.days) || 30));

export const relatoriosModule = new Elysia()
  .get("/workspaces/:slug/dashboard/", gerencial(readPainel))
  .get("/workspaces/:slug/reports/ratings/", gerencial(ratingsReport))
  .get(
    "/workspaces/:slug/reports/sla/",
    gerencial((slug, query) => slaReport(slug, readDias(query)))
  )
  .get(
    "/workspaces/:slug/reports/atendimentos/",
    gerencial(async (slug, query) => readRelatorioDeAtendimentos(slug, query, await readFusoDoWorkspace(slug)))
  )
  .get("/workspaces/:slug/registros/", gerencial(listRegistros));
