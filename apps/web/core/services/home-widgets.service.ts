/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TPreferenciaDeWidget } from "@/components/home/grade/grade-rules";
import { APIService } from "@/services/api.service";

export type TPreferenciasDaHome = { widgets: TPreferenciaDeWidget[] };

/** Grade de widgets da home: ordem, tamanho e ligado/desligado, por pessoa e por espaço. */
class HomeWidgetsService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  read(slug: string): Promise<TPreferenciasDaHome> {
    return this.get(`/api/workspaces/${slug}/home-preferences/`).then((r) => r?.data as TPreferenciasDaHome);
  }

  /** Substitui a grade inteira. */
  save(slug: string, widgets: TPreferenciaDeWidget[]): Promise<TPreferenciasDaHome> {
    return this.put(`/api/workspaces/${slug}/home-preferences/`, { widgets }).then(
      (r) => r?.data as TPreferenciasDaHome
    );
  }
}

export const homeWidgetsService = new HomeWidgetsService();
