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

/**
 * Telefone brasileiro, com ou sem DDI.
 *
 * O SAC guardava o campo como texto livre e recebeu de tudo — inclusive
 * `9999999999`. Aqui o número é a chave que o chat usa para reconhecer quem
 * está do outro lado do WhatsApp: errado, o cliente volta a ser um
 * desconhecido a cada conversa. Por isso o campo passa a ser mascarado
 * enquanto se digita e conferido antes de salvar.
 */
const DDI_BR = "55";

export function somenteDigitos(valor: string): string {
  return (valor ?? "").replace(/\D/g, "");
}

/** Tira o 55 da frente quando o que sobra ainda é um número nacional plausível. */
function semDdi(digitos: string): string {
  const cortado = digitos.startsWith(DDI_BR) ? digitos.slice(2) : digitos;
  return cortado.length === 10 || cortado.length === 11 ? cortado : digitos;
}

/** `67999990000` → `(67) 99999-0000`; `6733210000` → `(67) 3321-0000`. */
export function mascararTelefone(valor: string): string {
  const d = semDdi(somenteDigitos(valor)).slice(0, 11);
  if (d.length <= 2) return d;
  const ddd = `(${d.slice(0, 2)}) `;
  if (d.length <= 6) return ddd + d.slice(2);
  // Com 11 dígitos o nono entra no primeiro bloco: (67) 99999-0000.
  const corte = d.length > 10 ? 7 : 6;
  return `${ddd}${d.slice(2, corte)}-${d.slice(corte)}`;
}

/** Vazio é válido: telefone é opcional. */
export function telefoneInvalido(valor: string): string | null {
  const d = somenteDigitos(valor);
  if (!d) return null;
  const nacional = semDdi(d);
  if (nacional.length !== 10 && nacional.length !== 11)
    return "Telefone deve ter 10 ou 11 dígitos, com DDD.";
  if (nacional.length === 11 && nacional[2] !== "9")
    return "Celular com 11 dígitos precisa começar com 9 depois do DDD.";
  if (nacional[0] === "0") return "DDD inválido.";
  return null;
}
