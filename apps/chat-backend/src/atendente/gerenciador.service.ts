/**
 * Gerenciador de conversas (`chat.gerenciar`): o histórico inteiro do espaço,
 * filtrado e paginado de verdade. Filtros e paginação em
 * `gerenciador-regras.ts`; aqui a consulta e os nomes para a tela.
 */

import prisma from "@db";
import type { Prisma } from "@generated/prisma";
import { buildFiltroDoGerenciador, readPaginacao, type ConsultaDoGerenciador } from "@/atendente/gerenciador-regras";
import { findEntidadesPorId } from "@/atendente/plane.dao";
import { isAbandonado, rotuloDoAbandono } from "@/ciclo-de-vida/abandono";
import { readFusoDoWorkspace } from "@/presence";
import { attendantName } from "@/users";

const CAMPOS = {
  id: true,
  protocol: true,
  channel: true,
  status: true,
  clientName: true,
  clientPhone: true,
  entityId: true,
  projectId: true,
  projectName: true,
  assignedAttendantId: true,
  closeReason: true,
  endKind: true,
  abandonType: true,
  issueLabel: true,
  createdAt: true,
  closedAt: true,
} satisfies Prisma.ChatSessionSelect;

type Linha = Prisma.ChatSessionGetPayload<{ select: typeof CAMPOS }>;

async function readNomesDosAtendentes(linhas: Linha[]): Promise<Map<string, string>> {
  const ids = [...new Set(linhas.map((l) => l.assignedAttendantId).filter((id): id is string => Boolean(id)))];
  return new Map(await Promise.all(ids.map(async (id) => [id, await attendantName(id)] as const)));
}

const duracaoEmSegundos = (l: Linha) =>
  l.closedAt ? Math.round((l.closedAt.getTime() - l.createdAt.getTime()) / 1000) : null;

function serializeLinha(l: Linha, nomes: { atendentes: Map<string, string>; entidades: Map<string, string> }) {
  const abandonado = isAbandonado(l);
  return {
    id: l.id,
    protocol: l.protocol,
    channel: l.channel,
    status: l.status,
    client_name: l.clientName,
    client_phone: l.clientPhone,
    entity_id: l.entityId,
    entity_name: l.entityId ? (nomes.entidades.get(l.entityId) ?? null) : null,
    project_id: l.projectId,
    project_name: l.projectName,
    attendant_id: l.assignedAttendantId,
    attendant_name: l.assignedAttendantId ? (nomes.atendentes.get(l.assignedAttendantId) ?? null) : null,
    close_reason: l.closeReason,
    abandonado,
    abandono: abandonado ? rotuloDoAbandono(l.abandonType) : null,
    issue_label: l.issueLabel,
    duracao_seg: duracaoEmSegundos(l),
    created_at: l.createdAt,
    closed_at: l.closedAt,
  };
}

export async function listGerenciador(slug: string, query: ConsultaDoGerenciador) {
  const where = buildFiltroDoGerenciador(slug, query, await readFusoDoWorkspace(slug)) as Prisma.ChatSessionWhereInput;
  const { page, perPage, skip } = readPaginacao(query);
  const [count, linhas] = await Promise.all([
    prisma.chatSession.count({ where }),
    prisma.chatSession.findMany({ where, orderBy: [{ createdAt: "desc" }], skip, take: perPage, select: CAMPOS }),
  ]);
  const entidades = [...new Set(linhas.map((l) => l.entityId).filter((id): id is string => Boolean(id)))];
  const [atendentes, nomesDasEntidades] = await Promise.all([
    readNomesDosAtendentes(linhas),
    findEntidadesPorId(entidades),
  ]);
  return {
    count,
    page,
    per_page: perPage,
    total_pages: Math.max(1, Math.ceil(count / perPage)),
    results: linhas.map((l) => serializeLinha(l, { atendentes, entidades: nomesDasEntidades })),
  };
}
