/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Regras de tela das ferramentas do atendente (sem React, testáveis): tempo
 * legível, frase pronta no rascunho, dados técnicos do cliente, erro de campo
 * vindo do chat-backend e o aviso do alerta pausado.
 */

import type { ErroDoChat } from "@/services/atendente.service";

export function formatSegundos(segundos: number | null | undefined): string {
  if (segundos === null || segundos === undefined) return "-";
  if (segundos < 60) return `${segundos} s`;
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, "0")} min`;
}

/** A frase entra no fim do que o atendente já digitou. */
export const insertFrase = (rascunho: string, frase: string): string =>
  rascunho.trim() ? `${rascunho.trimEnd()} ${frase}` : frase;

/** Rótulos dos dados técnicos, na ordem em que aparecem no painel. */
const ROTULOS_DO_CLIENTE: [campo: string, rotulo: string][] = [
  ["versao", "Versão do sistema"],
  ["computador", "Computador"],
  ["navegador", "Navegador"],
  ["so", "Sistema operacional"],
  ["resolucao", "Resolução"],
  ["motivo", "Motivo"],
];

export const listClientInfo = (info: Record<string, string> | null | undefined) =>
  ROTULOS_DO_CLIENTE.filter(([campo]) => info?.[campo]).map(([campo, rotulo]) => ({ rotulo, valor: info![campo]! }));

export const readErroDoCampo = (erro: ErroDoChat | null | undefined, path: string): string | undefined =>
  erro?.errors?.find((e) => e.path === path)?.message;

export function rotuloDoAlertaPausado(ate: string | null | undefined, agora: Date = new Date()): string | null {
  if (!ate || new Date(ate).getTime() <= agora.getTime()) return null;
  const hora = new Date(ate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `Alerta pausado até ${hora}`;
}

/** `/chat/?sessao=<id>`: a tela de contatos abre a conversa que acabou de iniciar. */
export const readSessaoDaUrl = (search: string): string | null => new URLSearchParams(search).get("sessao");
