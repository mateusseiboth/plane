import { sdkFetch } from "../http";
import type { PaginatedResponse, Action, ActionFilters, ActionStats } from "../types";

export const actionsApi = {
  find(filters?: ActionFilters): Promise<PaginatedResponse<Action>> {
    return sdkFetch("/actions", filters as any);
  },

  findById(id: string): Promise<Action> {
    return sdkFetch(`/actions/${id}`);
  },

  stats(filters?: Pick<ActionFilters, "workspace_slug">): Promise<ActionStats> {
    return sdkFetch("/actions/stats", filters as any);
  },
};
