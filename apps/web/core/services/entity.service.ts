import { API_BASE_URL } from "@plane/constants";
import type { TEntity } from "@plane/types";
import { APIService } from "@/services/api.service";

export type { TEntity };

const ENTITY_TYPE_LABELS: Record<number, string> = {
  0: "Prefeitura",
  1: "Câmara",
  2: "Outros",
  3: "Escola",
  4: "Autarquia",
  5: "RPPS",
  6: "SAAE",
  7: "Consórcio",
};

export function entityTypeLabel(type?: number | null): string {
  if (type == null) return "";
  return ENTITY_TYPE_LABELS[type] ?? "";
}

export class EntityService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string): Promise<TEntity[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/entities/?is_active=true&cursor=1000:0:0`)
      .then((res) => res?.data?.results ?? res?.data ?? [])
      .catch(() => []);
  }

  async update(workspaceSlug: string, entityId: string, data: Partial<TEntity>): Promise<TEntity> {
    return this.patch(`/api/workspaces/${workspaceSlug}/entities/${entityId}/`, data)
      .then((res) => res?.data)
      .catch((err) => { throw err?.response?.data; });
  }
}

const entityService = new EntityService();
export default entityService;
