/**
 * Filtros da lista de visitas e o indicador de vencida. Sem banco.
 *
 * Vencida segue o SAC (`visita_dataprogramada < CURDATE()`): a data programada
 * ficou num dia anterior ao de hoje, no fuso do escritório, e a visita não foi
 * encerrada. Visita marcada para hoje cedo ainda não está vencida.
 */
import { inicioDeHoje, instanteDaEntrada } from "@utils/prazo";
import { VISIT_STATUS } from "@modules/technical-visit/visit-status";

export type VisitListQuery = {
  status?: string;
  technician_id?: string;
  entity_id?: string;
  date_from?: string;
  date_to?: string;
  overdue?: string;
};

const ENCERRADAS = [VISIT_STATUS.CONCLUIDA, VISIT_STATUS.CANCELADA];

export const isVisitOverdue = (visita: { scheduledDate: Date | null; status: number }, agora: Date): boolean =>
  !!visita.scheduledDate &&
  !(ENCERRADAS as readonly number[]).includes(visita.status) &&
  visita.scheduledDate.getTime() < inicioDeHoje(0, agora).getTime();

const readStatus = (valor: string | undefined): number | undefined => {
  if (valor === undefined || valor === "") return undefined;
  const status = Number(valor);
  return Number.isInteger(status) ? status : undefined;
};

const buildPeriodo = (query: VisitListQuery, agora: Date) => {
  const periodo = {
    gte: instanteDaEntrada(query.date_from, "inicio") ?? undefined,
    lte: instanteDaEntrada(query.date_to, "fim") ?? undefined,
    lt: query.overdue === "true" ? inicioDeHoje(0, agora) : undefined,
  };
  const definidos = Object.entries(periodo).filter(([, valor]) => valor !== undefined);
  return definidos.length ? Object.fromEntries(definidos) : undefined;
};

const buildStatus = (query: VisitListQuery) => {
  const status = readStatus(query.status);
  if (query.overdue !== "true") return status;
  return { notIn: ENCERRADAS, ...(status === undefined ? {} : { equals: status }) };
};

export function buildVisitListWhere(workspaceId: string, query: VisitListQuery, agora: Date) {
  const where: Record<string, any> = { workspaceId, deletedAt: null };
  const filtros: Record<string, unknown> = {
    technicianId: query.technician_id || undefined,
    entityId: query.entity_id || undefined,
    scheduledDate: buildPeriodo(query, agora),
    status: buildStatus(query),
  };
  for (const [campo, valor] of Object.entries(filtros)) {
    if (valor !== undefined) where[campo] = valor;
  }
  return where;
}
