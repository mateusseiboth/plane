/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Gestão de plugins em Configurações do espaço de trabalho.
 *
 * Backend: apps/api-ts/src/modules/plugin-registry/gestao.ts (exige a ação
 * `plugin.manage`). A configuração chave/valor não passa por aqui: ela é do
 * gateway do SDK (`/api/v1/plugin-sdk/config`), que já sabe ler o `configSchema`
 * do manifesto e esconder os campos secretos. Ver .claude/plugins.md.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TPermissaoDoPlugin = { key: string; label: string; description?: string };

export type TFuncaoDoEspaco = { id: string; key: string; name: string; level: number };

export type TPluginInstalado = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  version: string;
  author: string;
  status: "ACTIVE" | "INACTIVE" | "PENDING_APPROVAL" | "ARCHIVED";
  is_active: boolean;
  permissions: string[];
  contributions: { sidebar: { id: string; label: string }[]; pages: { path: string; title: string }[] };
  defined_permissions: TPermissaoDoPlugin[];
  has_config: boolean;
  created_at: string;
  updated_at: string;
};

export type TGradeDoPlugin = {
  permissions: TPermissaoDoPlugin[];
  roles: TFuncaoDoEspaco[];
  grants: Record<string, string[]>;
};

export type TCampoDeConfiguracao = {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "select" | "headers" | "secret";
  group?: string;
  description?: string;
  secret?: boolean;
  default?: unknown;
  options?: { label: string; value: string }[];
  required?: boolean;
};

const rethrow = (erro: any): never => {
  throw erro?.response?.data ?? erro;
};

export class PluginsService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private base(workspaceSlug: string) {
    return `/api/v1/workspaces/${encodeURIComponent(workspaceSlug)}/plugins`;
  }

  async list(workspaceSlug: string): Promise<TPluginInstalado[]> {
    return this.get(`${this.base(workspaceSlug)}/`)
      .then((res) => (res?.data?.results ?? []) as TPluginInstalado[])
      .catch(rethrow);
  }

  async upload(workspaceSlug: string, arquivo: File): Promise<TPluginInstalado> {
    const form = new FormData();
    form.append("file", arquivo);
    return this.post(`${this.base(workspaceSlug)}/`, form, { headers: { "Content-Type": "multipart/form-data" } })
      .then((res) => res?.data as TPluginInstalado)
      .catch(rethrow);
  }

  async toggle(workspaceSlug: string, id: string, isActive: boolean): Promise<TPluginInstalado> {
    return this.post(`${this.base(workspaceSlug)}/${id}/toggle/`, { is_active: isActive })
      .then((res) => res?.data as TPluginInstalado)
      .catch(rethrow);
  }

  async remove(workspaceSlug: string, id: string): Promise<void> {
    return this.delete(`${this.base(workspaceSlug)}/${id}/`)
      .then(() => undefined)
      .catch(rethrow);
  }

  async grants(workspaceSlug: string, id: string): Promise<TGradeDoPlugin> {
    return this.get(`${this.base(workspaceSlug)}/${id}/grants/`)
      .then((res) => res?.data as TGradeDoPlugin)
      .catch(rethrow);
  }

  async saveGrants(workspaceSlug: string, id: string, grants: Record<string, string[]>): Promise<TGradeDoPlugin> {
    return this.put(`${this.base(workspaceSlug)}/${id}/grants/`, { grants })
      .then((res) => res?.data as TGradeDoPlugin)
      .catch(rethrow);
  }

  // ── Configuração: rota do gateway do SDK, com o plugin no cabeçalho ──────────
  private async gateway<T>(pluginId: string, caminho: string, init?: RequestInit): Promise<T> {
    const resposta = await fetch(`${API_BASE_URL}/api/v1/plugin-sdk${caminho}`, {
      credentials: "include",
      ...init,
      headers: { "X-Plugin-Id": pluginId, "Content-Type": "application/json", ...init?.headers },
    });
    const texto = await resposta.text();
    const corpo = texto ? JSON.parse(texto) : undefined;
    if (!resposta.ok) throw corpo ?? { detail: "Não foi possível falar com o plugin." };
    return corpo as T;
  }

  async configSchema(pluginId: string): Promise<TCampoDeConfiguracao[]> {
    const campos = await this.gateway<TCampoDeConfiguracao[]>(pluginId, "/config/schema");
    return Array.isArray(campos) ? campos : [];
  }

  async config(workspaceSlug: string, pluginId: string): Promise<Record<string, unknown>> {
    const busca = `?scope=workspace&workspace_slug=${encodeURIComponent(workspaceSlug)}`;
    return this.gateway<Record<string, unknown>>(pluginId, `/config${busca}`);
  }

  async saveConfig(workspaceSlug: string, pluginId: string, values: Record<string, unknown>): Promise<void> {
    await this.gateway(pluginId, "/config", {
      method: "PUT",
      body: JSON.stringify({ scope: "workspace", workspace_slug: workspaceSlug, values }),
    });
  }
}

const pluginsService = new PluginsService();
export default pluginsService;
