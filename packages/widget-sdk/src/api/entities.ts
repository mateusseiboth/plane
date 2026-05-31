import { sdkFetch } from "../http";
import type { PaginatedResponse, Entity, EntityFilters } from "../types";

export const entitiesApi = {
  find(filters?: EntityFilters): Promise<PaginatedResponse<Entity>> {
    return sdkFetch("/entities", filters as any);
  },

  findById(id: string): Promise<Entity> {
    return sdkFetch(`/entities/${id}`);
  },
};
