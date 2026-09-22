/**
 * Monitor ao vivo (`chat.gerenciar`), no dashboard do chat: quem está na fila e
 * há quanto tempo, as conversas em atendimento com o tempo parado, os abandonos
 * do dia e os tempos de fila, atendimento e resposta. Ligação (canal `phone`)
 * fica de fora: não há cliente digitando. Legado: `intranet/chatger/`.
 *
 * Leitura do dia inteiro em duas consultas (conversas e mensagens) e agregação
 * em memória (`monitor-regras.ts`); nada de `_count` por linha.
 */

import prisma from "@db";
import { readAlertaPausadoAte } from "@/atendente/alerta";
import { computeTempos } from "@/atendente/monitor-regras";
import { WITHOUT_PHONE } from "@/canais";
import { isAbandonado, rotuloDoAbandono } from "@/ciclo-de-vida/abandono";
import { inicioDoDiaNoFuso } from "@/presence";
import { attendantName } from "@/users";

const segundosDesde = (instante: Date, agora: Date) =>
  Math.max(0, Math.round((agora.getTime() - instante.getTime()) / 1000));

/** Última mensagem de qualquer lado; sem mensagem nenhuma, a abertura da conversa. */
function readUltimaAtividade(s: {
  createdAt: Date;
  lastClientMessageAt: Date | null;
  lastAttendantMessageAt: Date | null;
}) {
  const mensagens = [s.lastClientMessageAt, s.lastAttendantMessageAt].filter((d): d is Date => d !== null);
  return mensagens.length ? new Date(Math.max(...mensagens.map((d) => d.getTime()))) : s.createdAt;
}

async function readFila(slug: string, agora: Date) {
  const fila = await prisma.chatSession.findMany({
    where: { workspaceId: slug, status: { in: ["bot", "queued"] }, ...WITHOUT_PHONE },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      protocol: true,
      status: true,
      channel: true,
      clientName: true,
      clientPhone: true,
      projectName: true,
      createdAt: true,
    },
  });
  return fila.map((s) => ({
    id: s.id,
    protocol: s.protocol,
    status: s.status,
    channel: s.channel,
    client_name: s.clientName ?? s.clientPhone,
    project_name: s.projectName,
    espera_seg: segundosDesde(s.createdAt, agora),
  }));
}

/** Parado = desde a última mensagem de qualquer lado; quem escreveu por último espera o outro. */
async function readAtivos(slug: string, agora: Date) {
  const ativos = await prisma.chatSession.findMany({
    where: { workspaceId: slug, status: { in: ["active", "paused"] }, ...WITHOUT_PHONE },
    select: {
      id: true,
      protocol: true,
      status: true,
      channel: true,
      clientName: true,
      clientPhone: true,
      projectName: true,
      assignedAttendantId: true,
      createdAt: true,
      lastClientMessageAt: true,
      lastAttendantMessageAt: true,
      slaAlertPausedAt: true,
    },
  });
  const linhas = await Promise.all(
    ativos.map(async (s) => {
      const cliente = s.lastClientMessageAt?.getTime() ?? 0;
      const atendente = s.lastAttendantMessageAt?.getTime() ?? 0;
      return {
        id: s.id,
        protocol: s.protocol,
        status: s.status,
        channel: s.channel,
        client_name: s.clientName ?? s.clientPhone,
        project_name: s.projectName,
        attendant_id: s.assignedAttendantId,
        attendant_name: s.assignedAttendantId ? await attendantName(s.assignedAttendantId) : null,
        parado_seg: segundosDesde(readUltimaAtividade(s), agora),
        aguardando: cliente > atendente ? "atendente" : "cliente",
        alerta_pausado: Boolean(readAlertaPausadoAte(s.slaAlertPausedAt, agora)),
      };
    })
  );
  return linhas.toSorted((a, b) => b.parado_seg - a.parado_seg);
}

type EncerradaHoje = { abandonType: number | null; endKind: string | null };

function countHoje(encerradas: EncerradaHoje[]) {
  const porTipo = new Map<number | null, number>();
  const abandonadas = encerradas.filter(isAbandonado);
  for (const s of abandonadas) porTipo.set(s.abandonType, (porTipo.get(s.abandonType) ?? 0) + 1);
  return {
    encerrados: encerradas.length,
    finalizados: encerradas.length - abandonadas.length,
    abandonados: abandonadas.length,
    por_tipo_abandono: [...porTipo.entries()]
      .toSorted(([a], [b]) => (a ?? 99) - (b ?? 99))
      .map(([tipo, total]) => ({ tipo, rotulo: rotuloDoAbandono(tipo), total })),
  };
}

async function readDoDia(slug: string) {
  const inicio = await inicioDoDiaNoFuso(slug);
  const [encerradas, doDia] = await Promise.all([
    prisma.chatSession.findMany({
      where: { workspaceId: slug, status: "closed", closedAt: { gte: inicio }, ...WITHOUT_PHONE },
      select: { abandonType: true, endKind: true },
    }),
    prisma.chatSession.findMany({
      where: { workspaceId: slug, createdAt: { gte: inicio }, ...WITHOUT_PHONE },
      select: { id: true, createdAt: true, closedAt: true, abandonType: true, endKind: true },
    }),
  ]);
  const mensagens = await prisma.chatMessage.findMany({
    where: { sessionId: { in: doDia.map((s) => s.id) }, sender: { in: ["client", "attendant"] }, deletedAt: null },
    select: { sessionId: true, sender: true, createdAt: true },
  });
  const sessoes = doDia.map((s) => ({
    id: s.id,
    createdAt: s.createdAt,
    closedAt: s.closedAt,
    abandonada: isAbandonado(s),
  }));
  return { hoje: countHoje(encerradas), tempos: computeTempos(sessoes, mensagens) };
}

export async function readMonitor(slug: string, agora = new Date()) {
  const [fila, ativos, doDia] = await Promise.all([readFila(slug, agora), readAtivos(slug, agora), readDoDia(slug)]);
  return { gerado_em: agora, fila, ativos, ...doDia };
}
