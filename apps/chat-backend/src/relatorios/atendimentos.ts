/**
 * Relatórios de atendimento do chat e a consulta dos registros encerrados.
 *
 * Substitui os relatórios do SAC: semanal por atendente (`chatSemanal*`),
 * finalizados x abandonados e tipo de abandono (`relatorioChatAbandSiste`), por
 * sistema, por dia da semana e por motivo (`relatorioMotivoEncerramento`,
 * `relatorioChatAtendimento`).
 *
 * A agregação é uma passada em memória sobre as sessões do período (`groupBy`
 * não cruza as seis dimensões de uma vez) e é pura: `aggregateAtendimentos`.
 */

import prisma from "@db";
import { isAbandonado, rotuloDoAbandono } from "@/ciclo-de-vida/abandono";
import { attendantName } from "@/users";

export type LinhaDoRelatorio = {
  assignedAttendantId: string | null;
  createdAt: Date;
  closedAt: Date | null;
  abandonType: number | null;
  endKind: string | null;
  projectName: string | null;
  closeReason: string | null;
};

const DIAS_DA_SEMANA = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

type Contagem = { total: number; finalizados: number; abandonados: number };
const createContagem = (): Contagem => ({ total: 0, finalizados: 0, abandonados: 0 });

function countLinha(alvo: Contagem, abandonada: boolean) {
  alvo.total += 1;
  alvo[abandonada ? "abandonados" : "finalizados"] += 1;
}

function getOrCreate<K, V>(mapa: Map<K, V>, chave: K, criar: () => V): V {
  const existente = mapa.get(chave);
  if (existente) return existente;
  const novo = criar();
  mapa.set(chave, novo);
  return novo;
}

const byTotalDesc = <T extends { total: number }>(a: T, b: T) => b.total - a.total;

function readWeekday(instante: Date, fuso: string): number {
  const curto = new Intl.DateTimeFormat("en-US", { timeZone: fuso, weekday: "short" }).format(instante);
  return WEEKDAY[curto] ?? 0;
}

type Atendente = Contagem & { duracaoTotal: number };

export function aggregateAtendimentos(
  sessoes: LinhaDoRelatorio[],
  opcoes: { fuso: string; nomes: Map<string, string> }
) {
  const finalizacao = createContagem();
  const porAtendente = new Map<string | null, Atendente>();
  const porSistema = new Map<string, Contagem>();
  const porAbandono = new Map<number | null, number>();
  const porMotivo = new Map<string, number>();
  const porDia = Array.from({ length: 7 }, () => 0);

  for (const s of sessoes) {
    const abandonada = isAbandonado(s);
    countLinha(finalizacao, abandonada);

    const atendente = getOrCreate(porAtendente, s.assignedAttendantId, () => ({
      ...createContagem(),
      duracaoTotal: 0,
    }));
    countLinha(atendente, abandonada);
    if (!abandonada && s.closedAt) atendente.duracaoTotal += s.closedAt.getTime() - s.createdAt.getTime();

    countLinha(getOrCreate(porSistema, s.projectName ?? "Sem sistema", createContagem), abandonada);
    porDia[readWeekday(s.createdAt, opcoes.fuso)] += 1;
    if (abandonada) porAbandono.set(s.abandonType, (porAbandono.get(s.abandonType) ?? 0) + 1);
    if (!abandonada && s.closeReason) porMotivo.set(s.closeReason, (porMotivo.get(s.closeReason) ?? 0) + 1);
  }

  return {
    finalizacao,
    por_atendente: [...porAtendente.entries()]
      .map(([userId, a]) => ({
        user_id: userId,
        name: userId ? (opcoes.nomes.get(userId) ?? "Atendente") : "Sem atendente",
        total: a.total,
        finalizados: a.finalizados,
        abandonados: a.abandonados,
        duracao_media_min: a.finalizados ? Math.round(a.duracaoTotal / a.finalizados / 60_000) : null,
      }))
      .toSorted(byTotalDesc),
    por_tipo_abandono: [...porAbandono.entries()]
      .toSorted(([a], [b]) => (a ?? 99) - (b ?? 99))
      .map(([tipo, total]) => ({ tipo, rotulo: rotuloDoAbandono(tipo), total })),
    por_sistema: [...porSistema.entries()]
      .map(([sistema, c]) => ({ sistema, total: c.total, finalizados: c.finalizados, abandonados: c.abandonados }))
      .toSorted(byTotalDesc),
    por_dia_da_semana: porDia.map((total, dia) => ({ dia, rotulo: DIAS_DA_SEMANA[dia]!, total })),
    por_motivo: [...porMotivo.entries()]
      .map(([motivo, total]) => ({ motivo, total }))
      .toSorted((a, b) => b.total - a.total || a.motivo.localeCompare(b.motivo, "pt-BR")),
  };
}

export type Periodo = { de: Date; ate: Date };

const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;
const UM_DIA_MS = 24 * 60 * 60 * 1000;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

const parseData = (valor: unknown): number | null => {
  if (typeof valor !== "string" || !DATA.test(valor)) return null;
  const ms = Date.parse(`${valor}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms;
};

/** `from`/`to` em AAAA-MM-DD; o dia final entra inteiro. Padrão: últimos 7 dias. */
export function readPeriodo(query: { from?: unknown; to?: unknown }, agora: Date): Periodo {
  const ate = parseData(query.to);
  const fim = ate === null ? agora.getTime() : ate + UM_DIA_MS;
  const de = parseData(query.from) ?? fim - SETE_DIAS_MS;
  return { de: new Date(de), ate: new Date(fim) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const readUuid = (valor: unknown): string | null => (typeof valor === "string" && UUID.test(valor) ? valor : null);
const readTexto = (valor: unknown): string | null => (typeof valor === "string" && valor.trim() ? valor.trim() : null);

export type FiltroDosRegistros = {
  entity_id?: unknown;
  project_id?: unknown;
  motivo?: unknown;
  attendant_id?: unknown;
};

/** Cada filtro vira uma chave do `where`; o que veio vazio ou inválido some. */
const FILTROS: Array<[campo: string, ler: (q: FiltroDosRegistros) => string | null]> = [
  ["entityId", (q) => readUuid(q.entity_id)],
  ["projectId", (q) => readUuid(q.project_id)],
  ["closeReason", (q) => readTexto(q.motivo)],
  ["assignedAttendantId", (q) => readTexto(q.attendant_id)],
];

export function buildFiltroDosRegistros(slug: string, query: FiltroDosRegistros, periodo: Periodo) {
  const extras = Object.fromEntries(FILTROS.map(([campo, ler]) => [campo, ler(query)]).filter(([, v]) => v !== null));
  return {
    workspaceId: slug,
    status: "closed",
    closedAt: { gte: periodo.de, lt: periodo.ate },
    ...extras,
  };
}

const LIMITE_DE_REGISTROS = 500;

async function readNomes(ids: Array<string | null>): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const pares = await Promise.all(unicos.map(async (id) => [id, await attendantName(id)] as const));
  return new Map(pares);
}

/** Relatório agregado do período, com os filtros dos registros. */
export async function readRelatorioDeAtendimentos(
  slug: string,
  query: FiltroDosRegistros & { from?: unknown; to?: unknown },
  fuso: string
) {
  const periodo = readPeriodo(query, new Date());
  const sessoes = await prisma.chatSession.findMany({
    where: buildFiltroDosRegistros(slug, query, periodo),
    select: {
      assignedAttendantId: true,
      createdAt: true,
      closedAt: true,
      abandonType: true,
      endKind: true,
      projectName: true,
      closeReason: true,
    },
  });
  const nomes = await readNomes(sessoes.map((s) => s.assignedAttendantId));
  return { de: periodo.de, ate: periodo.ate, ...aggregateAtendimentos(sessoes, { fuso, nomes }) };
}

/** O registro de atendimento: a sessão encerrada, consultável por entidade, sistema e motivo. */
export async function listRegistros(slug: string, query: FiltroDosRegistros & { from?: unknown; to?: unknown }) {
  const periodo = readPeriodo(query, new Date());
  const sessoes = await prisma.chatSession.findMany({
    where: buildFiltroDosRegistros(slug, query, periodo),
    orderBy: { closedAt: "desc" },
    take: LIMITE_DE_REGISTROS,
    select: {
      id: true,
      protocol: true,
      channel: true,
      clientName: true,
      clientPhone: true,
      entityId: true,
      projectId: true,
      projectName: true,
      closeReason: true,
      closeModuleName: true,
      closeNote: true,
      endKind: true,
      abandonType: true,
      assignedAttendantId: true,
      issueId: true,
      issueLabel: true,
      createdAt: true,
      closedAt: true,
    },
  });
  const nomes = await readNomes(sessoes.map((s) => s.assignedAttendantId));
  return {
    de: periodo.de,
    ate: periodo.ate,
    limite: LIMITE_DE_REGISTROS,
    results: sessoes.map((s) => ({
      id: s.id,
      protocol: s.protocol,
      channel: s.channel,
      client_name: s.clientName ?? s.clientPhone,
      entity_id: s.entityId,
      project_id: s.projectId,
      project_name: s.projectName,
      close_reason: s.closeReason,
      close_module_name: s.closeModuleName,
      close_note: s.closeNote,
      abandonado: isAbandonado(s),
      abandono: isAbandonado(s) ? rotuloDoAbandono(s.abandonType) : null,
      attendant_name: s.assignedAttendantId ? (nomes.get(s.assignedAttendantId) ?? null) : null,
      issue_id: s.issueId,
      issue_label: s.issueLabel,
      created_at: s.createdAt,
      closed_at: s.closedAt,
    })),
  };
}
