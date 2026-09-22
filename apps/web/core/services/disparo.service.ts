/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Disparo em massa: chamadas ao chat-backend (`/workspaces/:slug/disparo/...`).
// Todas exigem `chat.disparo`. Contrato em .claude/chat-disparo.md.

import { chatRequest } from "@/services/chat.service";

export type UltimoEnvio = { created_at: string; total: number; status: string };

export type MensagemDeDisparo = {
  id: string;
  titulo: string;
  texto: string | null;
  media_key: string | null;
  media_mime: string | null;
  media_name: string | null;
  created_at: string;
  updated_at: string;
  ultimo_envio: UltimoEnvio | null;
};

/** O que vai à API: só o filtro escolhido. */
export type FiltrosDoEnvio = { entity_type?: number; entity_id?: string; project_id?: string };

export type PreviaDoEnvio = { total: number; without_telefone: number; repetidos: number };

export type ResumoDoEnvio = {
  total: number;
  pendente: number;
  processando: number;
  enviado: number;
  falhou: number;
  cancelado: number;
};

export type ExecucaoDeDisparo = {
  id: string;
  mensagem_id: string;
  titulo: string;
  filtros: { entity_type: number | null; entity_id: string | null; project_id: string | null };
  total: number;
  without_telefone: number;
  repetidos: number;
  status: string;
  created_by_id: string;
  created_by_name: string;
  created_at: string;
  finished_at: string | null;
  resumo: ResumoDoEnvio;
};

export type ItemDoEnvio = {
  id: string;
  telefone: string;
  contact_id: string | null;
  contact_name: string | null;
  entity_name: string | null;
  status: string;
  erro: string | null;
  tentado_em: string | null;
};

export type DetalheDoEnvio = ExecucaoDeDisparo & { itens: ItemDoEnvio[] };

export type ItemDaFilaZapi = {
  id: string | null;
  telefone: string | null;
  mensagem: string | null;
  criadaEm: string | null;
};

export type ConfigDoDisparo = { mensagens_por_minuto: number };

export type ErroDoDisparo = { detail?: string; errors?: { path: string; message: string }[] };

const jsonInit = (method: string, data?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  ...(data === undefined ? {} : { body: JSON.stringify(data) }),
});

const base = (slug: string) => `/workspaces/${slug}/disparo`;

/** DELETE responde 204 sem corpo: não dá para ler JSON. */
async function deleteWithoutCorpo(apiUrl: string, path: string): Promise<void> {
  const res = await fetch(apiUrl.replace(/\/$/, "") + path, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw await res.json().catch(() => ({ detail: res.statusText }));
}

export function disparoApi(apiUrl: string) {
  const req = chatRequest(apiUrl);
  return {
    mediaUrl: (key: string, mime: string | null) =>
      `${apiUrl.replace(/\/$/, "")}/media/${key}${mime ? `?mime=${encodeURIComponent(mime)}` : ""}`,
    listMensagens: (slug: string): Promise<MensagemDeDisparo[]> => req(`${base(slug)}/mensagens/`),
    createMensagem: (slug: string, form: FormData): Promise<MensagemDeDisparo> =>
      req(`${base(slug)}/mensagens/`, { method: "POST", body: form }),
    updateMensagem: (slug: string, id: string, form: FormData): Promise<MensagemDeDisparo> =>
      req(`${base(slug)}/mensagens/${id}/`, { method: "PATCH", body: form }),
    deleteMensagem: (slug: string, id: string): Promise<void> =>
      deleteWithoutCorpo(apiUrl, `${base(slug)}/mensagens/${id}/`),
    previa: (slug: string, filtros: FiltrosDoEnvio): Promise<PreviaDoEnvio> =>
      req(`${base(slug)}/previa/`, jsonInit("POST", filtros)),
    send: (slug: string, id: string, filtros: FiltrosDoEnvio): Promise<ExecucaoDeDisparo> =>
      req(`${base(slug)}/mensagens/${id}/enviar/`, jsonInit("POST", filtros)),
    sendStatus: (slug: string, id: string): Promise<{ ok: boolean }> =>
      req(`${base(slug)}/mensagens/${id}/status/`, jsonInit("POST")),
    listExecucoes: (slug: string, mensagemId?: string): Promise<ExecucaoDeDisparo[]> =>
      req(`${base(slug)}/execucoes/${mensagemId ? `?mensagem_id=${mensagemId}` : ""}`),
    detalhe: (slug: string, id: string): Promise<DetalheDoEnvio> => req(`${base(slug)}/execucoes/${id}/`),
    cancel: (slug: string, id: string): Promise<DetalheDoEnvio> =>
      req(`${base(slug)}/execucoes/${id}/cancelar/`, jsonInit("POST")),
    filaZapi: (slug: string): Promise<ItemDaFilaZapi[]> => req(`${base(slug)}/fila-zapi/`),
    config: (slug: string): Promise<ConfigDoDisparo> => req(`${base(slug)}/config/`),
    saveConfig: (slug: string, data: ConfigDoDisparo): Promise<ConfigDoDisparo> =>
      req(`${base(slug)}/config/`, jsonInit("PUT", data)),
  };
}

export type DisparoApi = ReturnType<typeof disparoApi>;
