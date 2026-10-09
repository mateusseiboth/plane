import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export interface IWidget {
  id: string;
  name: string;
  description: string | null;
  version: string;
  author: string;
  entry_file: string;
  manifest: Record<string, unknown>;
  permissions: string[];
  status: "ACTIVE" | "INACTIVE" | "PENDING_APPROVAL" | "ARCHIVED";
  storage_key: string;
  created_by: string | null;
  /** `global` aparece para todos; `user` só na home de quem enviou. */
  scope: "global" | "user";
  owner_user_id: string | null;
  /** Quem enviou o widget de usuário (null no global). */
  owner: { id: string; display_name: string; email: string; first_name: string; last_name: string } | null;
  created_at: string;
  updated_at: string;
}

export interface IWidgetListResponse {
  results: IWidget[];
  total_count: number;
  next_cursor: string | null;
  prev_cursor: string | null;
  next_page_results: boolean;
}

/** `global`: só os de todos. `users`: os privados de todo mundo (só quem administra). Sem valor: os globais mais os meus. */
export type TEscopoDaListagem = "global" | "users";

const toFormDoZip = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return form;
};

const MULTIPART = { headers: { "Content-Type": "multipart/form-data" } };

export class WidgetService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(filters?: {
    name?: string;
    author?: string;
    status?: string;
    version?: string;
    scope?: TEscopoDaListagem;
  }): Promise<IWidgetListResponse> {
    const params = new URLSearchParams(
      Object.entries(filters ?? {}).filter((entrada): entrada is [string, string] => Boolean(entrada[1]))
    );
    return this.get(`/api/v1/widgets/?${params.toString()}`).then((r) => r.data);
  }

  /** Os widgets que a própria pessoa enviou (só na home dela). */
  async listMine(): Promise<IWidgetListResponse> {
    return this.get("/api/v1/widgets/mine/").then((r) => r.data);
  }

  /** Envia um widget "meu": qualquer membro ativo, sem precisar de quem administra. */
  async uploadMine(file: File): Promise<IWidget> {
    return this.post("/api/v1/widgets/mine/", toFormDoZip(file), MULTIPART).then((r) => r.data);
  }

  async removeMine(id: string): Promise<void> {
    return this.delete(`/api/v1/widgets/mine/${id}/`).then(() => undefined);
  }

  /** Widget de usuário passa a aparecer para todos (quem administra). */
  async makeGlobal(id: string): Promise<IWidget> {
    return this.post(`/api/v1/widgets/${id}/make-global/`).then((r) => r.data);
  }

  async getById(id: string): Promise<IWidget> {
    return this.get(`/api/v1/widgets/${id}`).then((r) => r.data);
  }

  async upload(file: File): Promise<IWidget> {
    return this.post("/api/v1/widgets/", toFormDoZip(file), MULTIPART).then((r) => r.data);
  }

  async update(id: string, data: { name?: string; description?: string }): Promise<IWidget> {
    return this.put(`/api/v1/widgets/${id}`, data).then((r) => r.data);
  }

  async activate(id: string): Promise<IWidget> {
    return this.post(`/api/v1/widgets/${id}/activate`).then((r) => r.data);
  }

  async deactivate(id: string): Promise<IWidget> {
    return this.post(`/api/v1/widgets/${id}/deactivate`).then((r) => r.data);
  }

  async remove(id: string): Promise<void> {
    return this.delete(`/api/v1/widgets/${id}`).then(() => undefined);
  }

  getAssetUrl(id: string, entryFile: string): string {
    return `${API_BASE_URL}/api/v1/widgets/${id}/assets/${entryFile}`;
  }
}

export const widgetService = new WidgetService();
