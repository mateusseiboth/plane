import { sdkFetch } from "../http";
import type { StatsOverview, EntityStats, PeriodFilters, PeriodStats } from "../types";

/**
 * Totais e estatísticas do espaço.
 * @permission stats.read
 */
export const statsApi = {
  /**
   * Visão geral: chamados abertos e fechados, solicitações e ações.
   * @param filters Espaço da consulta.
   * @returns Os totais do espaço.
   * @example
   * const { worker_items_open } = await statsApi.overview();
   */
  overview(filters?: { workspace_slug?: string }): Promise<StatsOverview> {
    return sdkFetch("/stats/overview", filters as any);
  },

  /**
   * Totais de chamados de uma entidade.
   * @param entityId Id da entidade.
   * @returns Os totais da entidade.
   * @example
   * const { open } = await statsApi.byEntity(entidadeId);
   */
  byEntity(entityId: string): Promise<EntityStats> {
    return sdkFetch(`/stats/entity/${entityId}`);
  },

  /**
   * Chamados criados e concluídos num período. `start_date` e `end_date` são obrigatórios.
   * @param params Período (AAAA-MM-DD) e, opcionalmente, o espaço.
   * @returns O movimento do período.
   * @example
   * const mes = await statsApi.period({ start_date: "2026-10-01", end_date: "2026-10-31" });
   */
  period(params: PeriodFilters): Promise<PeriodStats> {
    return sdkFetch("/stats/period", params as any);
  },
};
