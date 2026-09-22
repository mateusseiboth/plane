/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Ouvidoria, denúncia interna, currículos e lista de e-mails dos responsáveis.
// Contrato em apps/api-ts/src/modules/{ouvidoria,denuncia,curriculo,contato-email}
// e `.claude/ouvidoria-denuncia-curriculos.md`.

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TPessoaResumo = { id: string; display_name: string };

export type TPagina<T> = {
  results: T[];
  total_count: number;
  next_cursor: string;
  prev_cursor: string;
  next_page_results: boolean;
  prev_page_results: boolean;
};

export type TOuvidoria = {
  id: string;
  created_at: string;
  kind: "sugestao" | "reclamacao";
  kind_label: string;
  entity: { id: string; name: string } | null;
  cnpj: string | null;
  name: string;
  phone: string | null;
  message: string;
  protocol: string | null;
  chat_session_id: string | null;
  is_read: boolean;
  read_at: string | null;
  read_by: TPessoaResumo | null;
};

export type TDenuncia = {
  id: string;
  title: string;
  description: string;
  is_anonymous: boolean;
  /** Só o dia (`YYYY-MM-DD`): a denúncia não guarda hora, de propósito. */
  reported_on: string;
  author: TPessoaResumo | null;
};

export type TDenunciaPayload = { title: string; description: string; is_anonymous: boolean };

export type TCurriculo = {
  id: string;
  received_at: string;
  name: string;
  phone: string | null;
  email: string | null;
  position: string;
  city: string | null;
  /** "chat" (robô do WhatsApp) ou "site" (página Trabalhe conosco). */
  source: string;
  message: string | null;
  file_name: string;
  file_size: number;
  is_read: boolean;
  read_at: string | null;
  read_by: TPessoaResumo | null;
  is_interviewed: boolean;
  interviewed_at: string | null;
  interviewed_by: TPessoaResumo | null;
};

/** Prazo de guarda (LGPD) e o interruptor da página pública de inscrição. */
export type TCurriculoConfig = { retention_days: number; site_enabled: boolean };

export type TCurriculoMarcacao = Partial<{ is_read: boolean; is_interviewed: boolean }>;

export type TEmailDaLista = {
  email: string;
  name: string;
  entity_name: string | null;
  origem: "responsavel" | "interno";
};

export type TListaDeEmails = { total: number; emails: string[]; items: TEmailDaLista[] };

const rethrow = (err: { response?: { data?: unknown } }) => {
  throw err?.response?.data;
};

const dataOf = <T>(res: { data?: T } | undefined) => res?.data as T;

export class OuvidoriaService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private ws(slug: string) {
    return `/api/workspaces/${slug}`;
  }

  // ── Ouvidoria ──
  listOuvidoria(slug: string, query: string): Promise<TPagina<TOuvidoria>> {
    return this.get(`${this.ws(slug)}/ouvidoria/${query}`)
      .then(dataOf<TPagina<TOuvidoria>>)
      .catch(rethrow);
  }

  countOuvidoriaNaoLidas(slug: string): Promise<{ count: number }> {
    return this.get(`${this.ws(slug)}/ouvidoria/unread-count/`)
      .then(dataOf<{ count: number }>)
      .catch(rethrow);
  }

  markOuvidoriaLida(slug: string, id: string): Promise<TOuvidoria> {
    return this.post(`${this.ws(slug)}/ouvidoria/${id}/read/`, {})
      .then(dataOf<TOuvidoria>)
      .catch(rethrow);
  }

  // ── Denúncia ──
  createDenuncia(slug: string, data: TDenunciaPayload) {
    return this.post(`${this.ws(slug)}/denuncias/`, data)
      .then(dataOf)
      .catch(rethrow);
  }

  listDenuncias(slug: string, query: string): Promise<TPagina<TDenuncia>> {
    return this.get(`${this.ws(slug)}/denuncias/${query}`)
      .then(dataOf<TPagina<TDenuncia>>)
      .catch(rethrow);
  }

  // ── Currículos ──
  listCurriculos(slug: string, query: string): Promise<TPagina<TCurriculo>> {
    return this.get(`${this.ws(slug)}/curriculos/${query}`)
      .then(dataOf<TPagina<TCurriculo>>)
      .catch(rethrow);
  }

  listVagas(slug: string): Promise<string[]> {
    return this.get(`${this.ws(slug)}/curriculos/positions/`)
      .then(dataOf<string[]>)
      .catch(rethrow);
  }

  markCurriculo(slug: string, id: string, data: TCurriculoMarcacao): Promise<TCurriculo> {
    return this.patch(`${this.ws(slug)}/curriculos/${id}/`, data)
      .then(dataOf<TCurriculo>)
      .catch(rethrow);
  }

  removeCurriculo(slug: string, id: string): Promise<void> {
    return this.delete(`${this.ws(slug)}/curriculos/${id}/`)
      .then(() => undefined)
      .catch(rethrow);
  }

  readConfigDeCurriculos(slug: string): Promise<TCurriculoConfig> {
    return this.get(`${this.ws(slug)}/curriculos/config/`)
      .then(dataOf<TCurriculoConfig>)
      .catch(rethrow);
  }

  /** Salva só o que vem no payload: prazo de guarda e interruptor são botões diferentes. */
  saveConfigDeCurriculos(slug: string, data: Partial<TCurriculoConfig>): Promise<TCurriculoConfig> {
    return this.patch(`${this.ws(slug)}/curriculos/config/`, data)
      .then(dataOf<TCurriculoConfig>)
      .catch(rethrow);
  }

  /** Link direto: o navegador baixa com o cookie da sessão, e a API audita. */
  getCurriculoDownloadUrl(slug: string, id: string) {
    return `${API_BASE_URL}${this.ws(slug)}/curriculos/${id}/download/`;
  }

  // ── Lista de e-mails dos responsáveis ──
  findListaDeEmails(slug: string, query: string): Promise<TListaDeEmails> {
    return this.get(`${this.ws(slug)}/contact-emails/${query}`)
      .then(dataOf<TListaDeEmails>)
      .catch(rethrow);
  }

  getListaDeEmailsCsvUrl(slug: string, query: string) {
    return `${API_BASE_URL}${this.ws(slug)}/contact-emails/export/${query}`;
  }
}

const ouvidoriaService = new OuvidoriaService();

export default ouvidoriaService;
