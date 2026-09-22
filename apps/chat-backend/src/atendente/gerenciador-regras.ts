/**
 * Gerenciador de conversas: filtros e paginação da consulta de gestão sobre o
 * histórico INTEIRO do espaço (a lista do atendente continua recortada no dia).
 * Legado: `sac_chatGer_lista.php` e `popImprimeChatLista.php`.
 *
 * O `where` é montado em pedaços que se compõem num `AND`: cada filtro sabe ler
 * o seu parâmetro e devolve o seu pedaço, ou nada quando veio vazio/inválido.
 * Filtro novo = uma linha em `PEDACOS`. Puro.
 */

import { parseChannelFilter } from "@/canais";
import { readInicioDoDia } from "@/atendente/fuso";
import { isUuid, readText } from "@/ligacoes/payload";

export type ConsultaDoGerenciador = Record<string, string | undefined>;

const POR_PAGINA_PADRAO = 50;
const POR_PAGINA_MAXIMO = 500;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_CONHECIDOS = new Set(["bot", "queued", "active", "paused", "closed"]);

const readInteiro = (valor: unknown, padrao: number): number => {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : padrao;
};

export function readPaginacao(query: ConsultaDoGerenciador) {
  const page = readInteiro(query.page, 1);
  const perPage = Math.min(POR_PAGINA_MAXIMO, readInteiro(query.per_page, POR_PAGINA_PADRAO));
  return { page, perPage, skip: (page - 1) * perPage };
}

const readData = (valor: unknown): string | null => (typeof valor === "string" && DATA.test(valor) ? valor : null);

const somarUmDia = (data: string): string =>
  new Date(Date.parse(`${data}T12:00:00Z`) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** `from`/`to` em AAAA-MM-DD, no fuso da empresa; o dia final entra inteiro. */
function porPeriodo(query: ConsultaDoGerenciador, fuso: string) {
  const de = readData(query.from);
  const ate = readData(query.to);
  if (!de && !ate) return null;
  return {
    createdAt: {
      ...(de ? { gte: readInicioDoDia(de, fuso) } : {}),
      ...(ate ? { lt: readInicioDoDia(somarUmDia(ate), fuso) } : {}),
    },
  };
}

function porStatus(query: ConsultaDoGerenciador) {
  const status = String(query.status ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => STATUS_CONHECIDOS.has(s));
  return status.length ? { status: { in: status } } : null;
}

/** Número de telefone, protocolo (inclusive o de conversa anterior) ou nome do cliente. */
function porBusca(query: ConsultaDoGerenciador) {
  const termo = readText(query.q, 100);
  if (!termo) return null;
  return {
    OR: [
      { protocol: { contains: termo, mode: "insensitive" as const } },
      { clientName: { contains: termo, mode: "insensitive" as const } },
      { clientPhone: { contains: termo } },
    ],
  };
}

type Pedaco = (query: ConsultaDoGerenciador, fuso: string) => Record<string, unknown> | null;

const PEDACOS: Pedaco[] = [
  (q) => {
    const id = readText(q.attendant_id, 64);
    return id ? { assignedAttendantId: id } : null;
  },
  (q) => (isUuid(q.entity_id) ? { entityId: q.entity_id } : null),
  (q) => (isUuid(q.project_id) ? { projectId: q.project_id } : null),
  (q) => {
    const canal = parseChannelFilter(q.channel);
    return canal.channel ? canal : null;
  },
  porStatus,
  porPeriodo,
  porBusca,
];

export function buildFiltroDoGerenciador(slug: string, query: ConsultaDoGerenciador, fuso: string) {
  const pedacos = PEDACOS.map((pedaco) => pedaco(query, fuso)).filter((p): p is Record<string, unknown> => p !== null);
  return { AND: [{ workspaceId: slug }, ...pedacos] };
}
