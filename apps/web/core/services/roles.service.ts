import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

// ─────────────────────────────────────────────────────────────────────────────
// Serviço de funções configuráveis (workflow roles) — mapeia o módulo `roles`
// do backend (apps/api-ts/src/modules/roles). Admin-only.
// ─────────────────────────────────────────────────────────────────────────────

export type TRoleVisibility = {
  id?: string;
  group: string;
  state_name: string | null;
  can_view: boolean;
};

export type TRoleTransition = {
  id?: string;
  from_group: string;
  from_state_name: string | null;
  to_group: string;
  to_state_name: string | null;
  allowed: boolean;
};

export type TWorkflowRole = {
  id: string;
  name: string;
  key: string;
  level: number;
  is_system: boolean;
  permissions: string[];
  workspace_id: string;
  visibility: TRoleVisibility[];
  transitions: TRoleTransition[];
};

export class RolesService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  list(slug: string): Promise<TWorkflowRole[]> {
    return this.get(`/api/workspaces/${slug}/roles/`)
      .then((r) => (r?.data as TWorkflowRole[]) ?? [])
      .catch(() => []);
  }

  actions(slug: string): Promise<{ key: string }[]> {
    return this.get(`/api/workspaces/${slug}/roles/actions/`)
      .then((r) => (r?.data as { key: string }[]) ?? [])
      .catch(() => []);
  }

  create(slug: string, data: Partial<TWorkflowRole>): Promise<TWorkflowRole> {
    return this.post(`/api/workspaces/${slug}/roles/`, data).then((r) => r?.data);
  }

  update(slug: string, id: string, data: Partial<TWorkflowRole>): Promise<TWorkflowRole> {
    return this.patch(`/api/workspaces/${slug}/roles/${id}/`, data).then((r) => r?.data);
  }

  remove(slug: string, id: string): Promise<void> {
    return this.delete(`/api/workspaces/${slug}/roles/${id}/`).then(() => undefined);
  }

  setVisibility(slug: string, id: string, visibility: TRoleVisibility[]): Promise<TWorkflowRole> {
    return this.put(`/api/workspaces/${slug}/roles/${id}/visibility/`, { visibility }).then((r) => r?.data);
  }

  setTransitions(slug: string, id: string, transitions: TRoleTransition[]): Promise<TWorkflowRole> {
    return this.put(`/api/workspaces/${slug}/roles/${id}/transitions/`, { transitions }).then((r) => r?.data);
  }
}

const rolesService = new RolesService();
export default rolesService;
