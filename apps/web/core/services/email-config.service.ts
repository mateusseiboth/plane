/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TSmtpSecurity = "none" | "starttls" | "ssl";

/** O que a tela lê. A senha nunca volta: só `has_password`. */
export type TEmailConfig = {
  host: string;
  port: number;
  username: string;
  has_password: boolean;
  from_address: string;
  from_name: string;
  security: TSmtpSecurity;
  /** De onde vem o SMTP em uso: desta tela, das variáveis do servidor ou de lugar nenhum. */
  origin: "instance" | "env" | "none";
  is_configured: boolean;
};

export type TEmailConfigPayload = {
  host: string;
  port: number;
  username: string;
  /** Vazio mantém a senha gravada. */
  password?: string;
  from_address: string;
  from_name: string;
  security: TSmtpSecurity;
};

const rethrow = (err: any) => {
  throw err?.response?.data;
};

export class EmailConfigService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async read(workspaceSlug: string): Promise<TEmailConfig> {
    return this.get(`/api/workspaces/${workspaceSlug}/email-config/`)
      .then((res) => res?.data)
      .catch(rethrow);
  }

  async save(workspaceSlug: string, data: TEmailConfigPayload): Promise<TEmailConfig> {
    return this.patch(`/api/workspaces/${workspaceSlug}/email-config/`, data)
      .then((res) => res?.data)
      .catch(rethrow);
  }

  async sendTest(workspaceSlug: string): Promise<{ detail: string }> {
    return this.post(`/api/workspaces/${workspaceSlug}/email-config/test/`, {})
      .then((res) => res?.data)
      .catch(rethrow);
  }
}

const emailConfigService = new EmailConfigService();
export default emailConfigService;
