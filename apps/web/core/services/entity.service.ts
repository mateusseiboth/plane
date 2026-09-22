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

const readResults = (data: any): TEntity[] => (Array.isArray(data) ? data : (data?.results ?? []));

const rethrow = (err: any) => {
  throw err?.response?.data;
};

export class EntityService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string): Promise<TEntity[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/entities/?is_active=true&cursor=1000:0:0`)
      .then((res) => readResults(res?.data))
      .catch(() => []);
  }

  /** Todas as entidades, ativas ou não: é o que a tela de cadastro lista. */
  async listAll(workspaceSlug: string): Promise<TEntity[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/entities/?cursor=5000:0:0`)
      .then((res) => readResults(res?.data))
      .catch(rethrow);
  }

  async create(workspaceSlug: string, data: Partial<TEntity>): Promise<TEntity> {
    return this.post(`/api/workspaces/${workspaceSlug}/entities/`, data)
      .then((res) => res?.data)
      .catch(rethrow);
  }

  async update(workspaceSlug: string, entityId: string, data: Partial<TEntity>): Promise<TEntity> {
    return this.patch(`/api/workspaces/${workspaceSlug}/entities/${entityId}/`, data)
      .then((res) => res?.data)
      .catch(rethrow);
  }

  async remove(workspaceSlug: string, entityId: string): Promise<void> {
    await this.delete(`/api/workspaces/${workspaceSlug}/entities/${entityId}/`).catch(rethrow);
  }
}

const entityService = new EntityService();
export default entityService;
