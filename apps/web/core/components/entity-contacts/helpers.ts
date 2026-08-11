/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TEntityContact } from "@plane/types";

/** Mensagem do erro devolvido pela API (`{ detail }`), com texto de reserva. */
export function mensagemDeErro(erro: unknown, reserva: string): string {
  const detail = (erro as { detail?: unknown } | null)?.detail;
  return typeof detail === "string" && detail ? detail : reserva;
}

/** Linha de apoio do contato: papel, telefone e e-mail, sem vazios. */
export function descricaoDoContato(contact: TEntityContact): string {
  return [contact.type_name, contact.phone, contact.email].filter(Boolean).join(" · ");
}

/** `1980-05-01T00:00:00Z` e `1980-05-01` viram `1980-05-01` (valor de `<input type="date">`). */
export function paraCampoDeData(valor?: string | null): string {
  return valor ? valor.slice(0, 10) : "";
}
