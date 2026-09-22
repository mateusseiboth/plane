/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TPhoneBookEntry = {
  id: string;
  display_name: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  email: string;
  phone: string | null;
  mobile_phone: string | null;
  avatar_url: string | null;
};

export class PhoneBookService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string): Promise<TPhoneBookEntry[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/phone-book/`)
      .then((res) => res?.data ?? [])
      .catch((err) => {
        throw err?.response?.data;
      });
  }
}

const phoneBookService = new PhoneBookService();
export default phoneBookService;
