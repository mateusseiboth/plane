import { sdkFetch } from "../http";
import type { PaginatedResponse, Intake, IntakeFilters, IntakeStats } from "../types";

export const intakesApi = {
  find(filters?: IntakeFilters): Promise<PaginatedResponse<Intake>> {
    return sdkFetch("/intakes", filters as any);
  },

  findById(id: string): Promise<Intake> {
    return sdkFetch(`/intakes/${id}`);
  },

  stats(filters?: Pick<IntakeFilters, "workspace_slug">): Promise<IntakeStats> {
    return sdkFetch("/intakes/stats", filters as any);
  },
};
