/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TNewMemberAccount = {
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  password: string;
  role: number;
  project_ids: string[];
};

export type TCreatedMemberAccount = {
  id: string;
  email: string;
  username: string;
  display_name: string;
  role: number;
  project_ids: string[];
};

/** Conta criada pelo admin do espaço, com senha, papel e sistemas, sem convite. */
export class MemberAccountService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async create(workspaceSlug: string, data: TNewMemberAccount): Promise<TCreatedMemberAccount> {
    return this.post(`/api/workspaces/${workspaceSlug}/members/create/`, data)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }
}

const memberAccountService = new MemberAccountService();
export default memberAccountService;
