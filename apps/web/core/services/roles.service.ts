import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

// ─────────────────────────────────────────────────────────────────────────────
// Serviço de funções configuráveis (workflow roles) — mapeia o módulo `roles`
// do backend (apps/api-ts/src/modules/roles). Admin-only.
// ─────────────────────────────────────────────────────────────────────────────

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
  /** Única regra por papel que existe no produto: quem participa do projeto vê tudo. */
  transitions: TRoleTransition[];
};

/** Uma ação do catálogo do backend (`GET /roles/actions/`), já com rótulo pt-BR. */
export type TRoleAction = {
  key: string;
  label: string;
  group: string;
  scope: "project" | "workspace";
};

/** O que quem está logado pode no espaço: função + exceções por pessoa. */
export type TMyActions = {
  role: { id: string | null; key: string; level: number };
  permissions: string[];
  granted: string[];
  revoked: string[];
};

/** Exceções por pessoa sobre a função (`/roles/members/`). */
export type TMemberOverrides = {
  member_id: string;
  display_name: string;
  email: string;
  role_id: string | null;
  role_key: string;
  role_name: string;
  role_level: number;
  granted: string[];
  revoked: string[];
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

  actions(slug: string): Promise<TRoleAction[]> {
    return this.get(`/api/workspaces/${slug}/roles/actions/`)
      .then((r) => (r?.data as TRoleAction[]) ?? [])
      .catch(() => []);
  }

  me(slug: string): Promise<TMyActions | undefined> {
    return this.get(`/api/workspaces/${slug}/roles/me/`)
      .then((r) => r?.data as TMyActions)
      .catch(() => undefined);
  }

  members(slug: string): Promise<TMemberOverrides[]> {
    return this.get(`/api/workspaces/${slug}/roles/members/`)
      .then((r) => (r?.data as TMemberOverrides[]) ?? [])
      .catch(() => []);
  }

  setMemberOverrides(
    slug: string,
    memberId: string,
    data: Pick<TMemberOverrides, "granted" | "revoked">
  ): Promise<TMemberOverrides> {
    return this.put(`/api/workspaces/${slug}/roles/members/${memberId}/`, data).then((r) => r?.data);
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

  setTransitions(slug: string, id: string, transitions: TRoleTransition[]): Promise<TWorkflowRole> {
    return this.put(`/api/workspaces/${slug}/roles/${id}/transitions/`, { transitions }).then((r) => r?.data);
  }
}

const rolesService = new RolesService();
export default rolesService;
