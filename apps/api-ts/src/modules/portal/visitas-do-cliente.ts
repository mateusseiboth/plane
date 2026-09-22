/**
 * Leitura das visitas técnicas da entidade do cliente, para o portal.
 *
 * Só leitura, e só da entidade gravada na conta do portal: conta sem entidade
 * não vê visita nenhuma. A consulta e o serializer são os do módulo
 * `technical-visit`; o recorte do que sai para fora mora em `./visitas`.
 */

import type { ContaDoPortal } from "@modules/portal/conta";
import { isUuid } from "@modules/portal/conta";
import {
  buildVisitaDoCliente,
  buildWhereDasVisitasDoCliente,
  readSituacaoDeVisita,
  type VisitaDoCliente,
} from "@modules/portal/visitas";
import { serializeVisit } from "@modules/technical-visit/visit-serializer";
import { VISIT_STATUS } from "@modules/technical-visit/visit-status";
import { findDetalhesDaVisita, findVisita, listVisitas } from "@modules/technical-visit/visit.dao";

/** O portal não pagina: 100 visitas por situação cobrem anos de uma entidade. */
const LIMITE_DA_LISTA = 100;

export async function findVisitasDaConta(conta: ContaDoPortal, situacao: unknown): Promise<VisitaDoCliente[]> {
  if (!conta.entityId) return [];
  const agora = new Date();
  const where = buildWhereDasVisitasDoCliente(conta.workspaceId, conta.entityId, readSituacaoDeVisita(situacao), agora);
  const visitas = await listVisitas(where, 0, LIMITE_DA_LISTA);
  return visitas.map((v) => buildVisitaDoCliente(serializeVisit(v, agora)));
}

/** O relatório de uma visita da entidade da conta; `null` para qualquer outra (inclusive cancelada). */
export async function readVisitaDaConta(conta: ContaDoPortal, visitId: string): Promise<VisitaDoCliente | null> {
  if (!conta.entityId || !isUuid(visitId)) return null;
  const visita = await findVisita(conta.workspaceId, visitId);
  if (!visita || visita.entityId !== conta.entityId || visita.status === VISIT_STATUS.CANCELADA) return null;
  return buildVisitaDoCliente(serializeVisit(visita, new Date(), await findDetalhesDaVisita(visita)));
}
