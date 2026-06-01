import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export interface IPluginSidebarItem {
  id: string;
  label: string;
  icon?: string;
  page: string;
  order?: number;
}

export interface IPluginPage {
  path: string;
  title: string;
  component?: string;
}

export interface IPluginContributions {
  sidebar: IPluginSidebarItem[];
  pages: IPluginPage[];
}

export interface IPlugin {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  version: string;
  author: string;
  entry_file: string;
  manifest: Record<string, unknown>;
  permissions: string[];
  contributions: IPluginContributions;
  status: "ACTIVE" | "INACTIVE" | "PENDING_APPROVAL" | "ARCHIVED";
  storage_key: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface IActivePlugin {
  id: string;
  name: string;
  slug: string;
  version: string;
  entry_file: string;
  permissions: string[];
  contributions: IPluginContributions;
}

export interface IPluginListResponse {
  results: IPlugin[];
  total_count: number;
  next_cursor: string | null;
  prev_cursor: string | null;
  next_page_results: boolean;
}

export class PluginService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(filters?: { name?: string; author?: string; status?: string; version?: string }): Promise<IPluginListResponse> {
    const params = new URLSearchParams();
    if (filters?.name) params.set("name", filters.name);
    if (filters?.author) params.set("author", filters.author);
    if (filters?.status) params.set("status", filters.status);
    if (filters?.version) params.set("version", filters.version);
    return this.get(`/api/v1/plugins/?${params.toString()}`).then((r) => r.data);
  }

  async listActive(): Promise<{ results: IActivePlugin[] }> {
    return this.get(`/api/v1/plugins/active`).then((r) => r.data);
  }

  async getById(id: string): Promise<IPlugin> {
    return this.get(`/api/v1/plugins/${id}`).then((r) => r.data);
  }

  async upload(file: File): Promise<IPlugin> {
    const form = new FormData();
    form.append("file", file);
    return this.post("/api/v1/plugins/", form, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data);
  }

  async update(id: string, data: { name?: string; description?: string }): Promise<IPlugin> {
    return this.put(`/api/v1/plugins/${id}`, data).then((r) => r.data);
  }

  async activate(id: string): Promise<IPlugin> {
    return this.post(`/api/v1/plugins/${id}/activate`).then((r) => r.data);
  }

  async deactivate(id: string): Promise<IPlugin> {
    return this.post(`/api/v1/plugins/${id}/deactivate`).then((r) => r.data);
  }

  async remove(id: string): Promise<void> {
    return this.delete(`/api/v1/plugins/${id}`).then(() => undefined);
  }

  getAssetUrl(id: string, entryFile: string): string {
    return `${API_BASE_URL}/api/v1/plugins/${id}/assets/${entryFile}`;
  }
}

export const pluginService = new PluginService();
