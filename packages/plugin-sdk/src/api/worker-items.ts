import { sdkFetch } from "../http";
import type { PaginatedResponse, WorkerItem, WorkerItemFilters, WorkerItemStats } from "../types";

export const workerItemsApi = {
  find(filters?: WorkerItemFilters): Promise<PaginatedResponse<WorkerItem>> {
    return sdkFetch("/worker-items", filters as any);
  },

  findById(id: string): Promise<WorkerItem> {
    return sdkFetch(`/worker-items/${id}`);
  },

  stats(filters?: Pick<WorkerItemFilters, "workspace_slug" | "entity_id">): Promise<WorkerItemStats> {
    return sdkFetch("/worker-items/stats", filters as any);
  },
};
