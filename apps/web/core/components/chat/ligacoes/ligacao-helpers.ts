/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Regras de tela das ligações do FreePBX. Puro: nada aqui chama a API.
 */

export const PHONE_CHANNEL = "phone";

export const isLigacao = (s: { channel: string }): boolean => s.channel === PHONE_CHANNEL;

/** Opções do filtro por tipo na lista de atendimentos (`?channel=` do chat-backend). */
export const CANAL_FILTROS = [
  { value: "", label: "Todos" },
  { value: "whatsapp,native", label: "Conversas" },
  { value: PHONE_CHANNEL, label: "Ligações" },
] as const;

const STATUS_LABEL: Record<string, string> = { answered: "Atendida", missed: "Não atendida" };

export const statusDaLigacaoLabel = (status: string): string => STATUS_LABEL[status] ?? status;

const doisDigitos = (n: number) => String(n).padStart(2, "0");

export function formatDuracao(segundos: number | null | undefined): string {
  if (segundos == null) return "";
  const horas = Math.floor(segundos / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);
  const resto = segundos % 60;
  if (horas) return `${horas}h ${doisDigitos(minutos)}min`;
  if (minutos) return resto ? `${minutos}min ${doisDigitos(resto)}s` : `${minutos}min`;
  return `${resto}s`;
}

type ErroDoServidor = { detail?: string; errors?: { path: string; message: string }[] } | undefined;

/** `errors: [{ path, message }]` do chat-backend vira mensagem por campo do formulário. */
export const groupErrosPorCampo = (erro: ErroDoServidor): Record<string, string> =>
  Object.fromEntries((erro?.errors ?? []).map((e) => [e.path, e.message]));

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

const escapeHtml = (texto: string) => texto.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

type DadosDoChamado = {
  protocol: string;
  clientName: string | null | undefined;
  clientPhone: string | null | undefined;
  descricao: string | null | undefined;
  entityId: string | null | undefined;
  chatUrl: string;
};

/**
 * O chamado aberto a partir da ligação já sai preenchido: quem ligou, o que
 * pediu (escapado, porque é texto digitado) e a entidade do cliente.
 */
export function buildChamadoDaLigacao(d: DadosDoChamado) {
  const quem = d.clientName || d.clientPhone || "Cliente";
  const descricao = d.descricao ? `<p>${escapeHtml(d.descricao)}</p>` : "";
  return {
    name: `Ligação ${d.protocol}: ${quem}`,
    description_html:
      `<p><strong>Atendimento por telefone</strong>, ${escapeHtml(quem)} (protocolo ${escapeHtml(d.protocol)}).</p>` +
      descricao +
      `<p><a href="${escapeHtml(d.chatUrl)}">Ver registro da ligação</a></p>`,
    ...(d.entityId ? { entity_id: d.entityId } : {}),
  };
}
