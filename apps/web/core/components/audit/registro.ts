/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Coluna "Registro" da trilha de auditoria: quem resolve o rótulo e a rota é o
// backend (`registro`). Aqui fica só a rede de segurança para a resposta antiga
// que ainda não traz o campo, para a tela não voltar a mostrar um uuid solto.

import type { TAuditLog } from "@/services/audit.service";

/** O que o administrador lê na coluna Registro. */
export function rotuloDoRegistro(log: TAuditLog, tituloDoTipo: string): string {
  return log.registro?.rotulo?.trim() || `${tituloDoTipo} ${log.entity_id.slice(0, 8)}`;
}

/** Rota que abre o registro, ou null quando não há para onde levar o usuário. */
export function caminhoDoRegistro(log: TAuditLog): string | null {
  return log.registro?.caminho || null;
}
