import { sdkFetch } from "../http";
import type { StatsOverview, EntityStats, PeriodStats } from "../types";

export const statsApi = {
  overview(filters?: { workspace_slug?: string }): Promise<StatsOverview> {
    return sdkFetch("/stats/overview", filters as any);
  },

  byEntity(entityId: string): Promise<EntityStats> {
    return sdkFetch(`/stats/entity/${entityId}`);
  },

  period(params: { start_date: string; end_date: string; workspace_slug?: string }): Promise<PeriodStats> {
    return sdkFetch("/stats/period", params as any);
  },
};
