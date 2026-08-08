/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type THomeSummary = {
  meus_abertos: number;
  meus_atrasados: number;
  meus_vencem_hoje: number;
  abertos_por_mim: number;
  em_triagem: number;
  solicitacoes_pendentes: number;
  concluidos_7d: number;
  criados_7d: number;
  por_prioridade: { priority: string; count: number }[];
  por_etapa: { name: string; color: string; group: string; count: number }[];
  projetos: number;
};

export type THomeOverdueItem = {
  id: string;
  name: string;
  priority: string;
  target_date: string | null;
  sequence_id: number;
  project_id: string;
  project_identifier: string;
  project_name: string;
  state_name: string | null;
  state_color: string | null;
  state_group: string | null;
};

const VAZIO: THomeSummary = {
  meus_abertos: 0,
  meus_atrasados: 0,
  meus_vencem_hoje: 0,
  abertos_por_mim: 0,
  em_triagem: 0,
  solicitacoes_pendentes: 0,
  concluidos_7d: 0,
  criados_7d: 0,
  por_prioridade: [],
  por_etapa: [],
  projetos: 0,
};

/**
 * Números da página inicial.
 *
 * Uma requisição só para toda a faixa de indicadores — a home é a primeira tela
 * do dia e não pode abrir disparando uma dezena de chamadas.
 */
class HomeSummaryService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  /** Falha vira zeros: um erro de rede não pode deixar a home em branco. */
  summary(workspaceSlug: string): Promise<THomeSummary> {
    return this.get(`/api/workspaces/${workspaceSlug}/home-summary/`)
      .then((r) => (r?.data as THomeSummary) ?? VAZIO)
      .catch(() => VAZIO);
  }

  overdue(workspaceSlug: string, limit = 6): Promise<THomeOverdueItem[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/home-overdue/`, { params: { limit } })
      .then((r) => (r?.data as THomeOverdueItem[]) ?? [])
      .catch(() => []);
  }
}

export const homeSummaryService = new HomeSummaryService();
