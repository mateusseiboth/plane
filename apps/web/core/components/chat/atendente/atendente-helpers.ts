/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Regras de tela das ferramentas do atendente (sem React, testáveis): tempo
 * legível, frase pronta no rascunho e seus grupos, dados técnicos do cliente,
 * erro de campo vindo do chat-backend, o aviso do alerta pausado, o sistema da
 * conversa no seletor e a lista depois de uma transferência.
 */

import type { ErroDoChat, FrasePronta } from "@/services/atendente.service";

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

/** Seletor do compositor: "Minhas frases" e "Do espaço", cada grupo na ordem do servidor. */
export const groupFrases = <F extends Pick<FrasePronta, "escopo">>(frases: F[]) => ({
  minhas: frases.filter((f) => f.escopo === "pessoal"),
  doEspaco: frases.filter((f) => f.escopo === "espaco"),
});

type Opcao = { value: string; label: string };
type SistemaDaConversa = {
  project_id?: string | null;
  project_name?: string | null;
  project_identifier?: string | null;
};

/**
 * As opções de sistema vêm dos projetos de que a pessoa participa. Quem recebe
 * uma conversa transferida pode não participar do sistema dela, e o seletor
 * mostrava "Selecione" com o sistema gravado. O sistema da conversa entra sempre.
 */
export function withSistemaDaConversa(projetos: Opcao[], sessao: SistemaDaConversa | null): Opcao[] {
  const id = sessao?.project_id;
  if (!id || projetos.some((p) => p.value === id)) return projetos;
  return [{ value: id, label: sessao.project_name ?? sessao.project_identifier ?? id }, ...projetos];
}

type AvisoDeTransferencia = { session_id: string; to_user_id: string };
type SessaoComDono = { id: string; assigned_attendant_id?: string | null };

/**
 * `session.transferred_out`: a conversa saiu de quem atendia. Quem tem
 * `chat.ver_todas` vê as dos outros, então ela fica com o novo dono; os demais
 * deixam de vê-la na hora.
 */
const TRANSFERENCIA_NA_LISTA = {
  todas: <S extends SessaoComDono>(sessoes: S[], aviso: AvisoDeTransferencia) =>
    sessoes.map((s) => (s.id === aviso.session_id ? { ...s, assigned_attendant_id: aviso.to_user_id } : s)),
  minhas: <S extends SessaoComDono>(sessoes: S[], aviso: AvisoDeTransferencia) =>
    sessoes.filter((s) => s.id !== aviso.session_id),
};

export const applyTransferenciaNaLista = <S extends SessaoComDono>(
  sessoes: S[],
  aviso: AvisoDeTransferencia,
  podeVerTodas: boolean
): S[] => TRANSFERENCIA_NA_LISTA[podeVerTodas ? "todas" : "minhas"](sessoes, aviso);

/** `/chat/?sessao=<id>`: a tela de contatos abre a conversa que acabou de iniciar. */
export const readSessaoDaUrl = (search: string): string | null => new URLSearchParams(search).get("sessao");
