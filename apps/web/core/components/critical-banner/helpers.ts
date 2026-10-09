/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { RealtimeEvent } from "@/hooks/use-realtime";

const PRIORIDADE_URGENTE = "urgent";

const isEventoDeChamado = (event: RealtimeEvent) => event.entity === "issue";

const isChamadoNaFaixa = (event: RealtimeEvent, idsNaFaixa: readonly string[]) =>
  Boolean(event.id) && idsNaFaixa.includes(event.id as string);

// O publicador que não manda a prioridade (portal, triagem) não diz se o chamado
// é urgente; na dúvida a faixa busca de novo, que é barato.
const isPrioridadeDesconhecida = (event: RealtimeEvent) => event.priority === undefined || event.priority === null;

const isChamadoUrgente = (event: RealtimeEvent) => event.priority === PRIORIDADE_URGENTE;

/**
 * O evento pode mudar a faixa de urgentes? Chamado que já está na faixa pode ter
 * saído (prioridade baixou, etapa concluída, apagado); chamado de fora só entra
 * se for urgente.
 */
export const isEventoDaFaixaDeUrgentes = (event: RealtimeEvent, idsNaFaixa: readonly string[]) =>
  isEventoDeChamado(event) &&
  (isChamadoNaFaixa(event, idsNaFaixa) || isPrioridadeDesconhecida(event) || isChamadoUrgente(event));
