/**
 * Páginas da wiki do espaço de trabalho (sem sistema). A API é a mesma árvore
 * de rotas das páginas de sistema, sem o projeto no caminho, mais as rotas que
 * só a wiki tem (`/wiki/pages/` e `/wiki/search/`).
 */
import { API_BASE_URL } from "@plane/constants";
import type { TDocumentPayload, TPage, TPageVersion, TWikiSearchResult } from "@plane/types";
import { APIService } from "@/services/api.service";

export class WorkspacePageService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private base(workspaceSlug: string) {
    return `/api/workspaces/${workspaceSlug}`;
  }

  private async unwrap<T>(call: Promise<{ data: T }>): Promise<T> {
    return call
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** A wiki inteira em lista simples (`parent_id`, `sort_order`): a tela monta a árvore. */
  async fetchTree(workspaceSlug: string): Promise<TPage[]> {
    return this.unwrap(this.get(`${this.base(workspaceSlug)}/wiki/pages/`));
  }

  async search(workspaceSlug: string, search: string): Promise<TWikiSearchResult[]> {
    return this.unwrap(this.get(`${this.base(workspaceSlug)}/wiki/search/`, { params: { search } }));
  }

  async fetchArchived(workspaceSlug: string): Promise<TPage[]> {
    return this.unwrap(this.get(`${this.base(workspaceSlug)}/archived-pages/`));
  }

  async fetchById(workspaceSlug: string, pageId: string): Promise<TPage> {
    return this.unwrap(this.get(`${this.base(workspaceSlug)}/pages/${pageId}/`));
  }

  async create(workspaceSlug: string, data: Partial<TPage>): Promise<TPage> {
    return this.unwrap(this.post(`${this.base(workspaceSlug)}/pages/`, data));
  }

  async update(workspaceSlug: string, pageId: string, data: Partial<TPage>): Promise<TPage> {
    return this.unwrap(this.patch(`${this.base(workspaceSlug)}/pages/${pageId}/`, data));
  }

  async updateAccess(workspaceSlug: string, pageId: string, data: Pick<TPage, "access">): Promise<void> {
    return this.unwrap(this.post(`${this.base(workspaceSlug)}/pages/${pageId}/access/`, data));
  }

  async remove(workspaceSlug: string, pageId: string): Promise<void> {
    return this.unwrap(this.delete(`${this.base(workspaceSlug)}/pages/${pageId}/`));
  }

  async archive(workspaceSlug: string, pageId: string): Promise<{ archived_at: string }> {
    return this.unwrap(this.post(`${this.base(workspaceSlug)}/pages/${pageId}/archive/`));
  }

  async restore(workspaceSlug: string, pageId: string): Promise<void> {
    return this.unwrap(this.delete(`${this.base(workspaceSlug)}/pages/${pageId}/archive/`));
  }

  async lock(workspaceSlug: string, pageId: string): Promise<void> {
    return this.unwrap(this.post(`${this.base(workspaceSlug)}/pages/${pageId}/lock/`));
  }

  async unlock(workspaceSlug: string, pageId: string): Promise<void> {
    return this.unwrap(this.delete(`${this.base(workspaceSlug)}/pages/${pageId}/lock/`));
  }

  async duplicate(workspaceSlug: string, pageId: string): Promise<TPage> {
    return this.unwrap(this.post(`${this.base(workspaceSlug)}/pages/${pageId}/duplicate/`));
  }

  async fetchDescriptionBinary(workspaceSlug: string, pageId: string): Promise<ArrayBuffer> {
    return this.unwrap(
      this.get(`${this.base(workspaceSlug)}/pages/${pageId}/description/`, {
        headers: { "Content-Type": "application/octet-stream" },
        responseType: "arraybuffer",
      })
    );
  }

  async updateDescription(workspaceSlug: string, pageId: string, data: TDocumentPayload): Promise<void> {
    return this.unwrap(this.patch(`${this.base(workspaceSlug)}/pages/${pageId}/description/`, data));
  }

  async fetchAllVersions(workspaceSlug: string, pageId: string): Promise<TPageVersion[]> {
    return this.unwrap(this.get(`${this.base(workspaceSlug)}/pages/${pageId}/versions/`));
  }

  async fetchVersionById(workspaceSlug: string, pageId: string, versionId: string): Promise<TPageVersion> {
    return this.unwrap(this.get(`${this.base(workspaceSlug)}/pages/${pageId}/versions/${versionId}/`));
  }
}
