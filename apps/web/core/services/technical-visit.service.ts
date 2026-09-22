/**
 * Visitas técnicas (`/workspaces/:slug/technical-visits/`). Erros de escrita
 * sobem com o corpo da API (`{detail, errors}`) para a tela pôr cada um no campo.
 */
import { API_BASE_URL } from "@plane/constants";
import type { TPaginatedVisits, TTechnicalVisit } from "@/components/technical-visits/types";
import { APIService } from "@/services/api.service";

const rethrow = (error: any) => {
  throw error?.response?.data ?? error;
};

export class TechnicalVisitService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private url(slug: string, sufixo = "") {
    return `/api/workspaces/${slug}/technical-visits/${sufixo}`;
  }

  async list(slug: string, params: Record<string, string>): Promise<TPaginatedVisits> {
    return this.get(this.url(slug), { params })
      .then((r) => r?.data)
      .catch(rethrow);
  }

  async retrieve(slug: string, visitId: string): Promise<TTechnicalVisit> {
    return this.get(this.url(slug, `${visitId}/`))
      .then((r) => r?.data)
      .catch(rethrow);
  }

  async create(slug: string, data: Record<string, unknown>): Promise<TTechnicalVisit> {
    return this.post(this.url(slug), data)
      .then((r) => r?.data)
      .catch(rethrow);
  }

  async update(slug: string, visitId: string, data: Record<string, unknown>): Promise<TTechnicalVisit> {
    return this.patch(this.url(slug, `${visitId}/`), data)
      .then((r) => r?.data)
      .catch(rethrow);
  }

  async linkIssue(slug: string, visitId: string, issueId: string): Promise<TTechnicalVisit> {
    return this.post(this.url(slug, `${visitId}/issues/`), { issue_id: issueId })
      .then((r) => r?.data)
      .catch(rethrow);
  }

  async unlinkIssue(slug: string, visitId: string, issueId: string): Promise<void> {
    return this.delete(this.url(slug, `${visitId}/issues/${issueId}/`))
      .then(() => undefined)
      .catch(rethrow);
  }

  async uploadAttachment(slug: string, visitId: string, file: File): Promise<TTechnicalVisit> {
    const form = new FormData();
    form.append("file", file);
    return this.post(this.url(slug, `${visitId}/attachments/`), form)
      .then((r) => r?.data)
      .catch(rethrow);
  }

  async downloadAttachment(slug: string, visitId: string, attachmentId: string): Promise<Blob> {
    return this.get(this.url(slug, `${visitId}/attachments/${attachmentId}/`), {}, { responseType: "blob" })
      .then((r) => r?.data)
      .catch(rethrow);
  }

  async removeAttachment(slug: string, visitId: string, attachmentId: string): Promise<void> {
    return this.delete(this.url(slug, `${visitId}/attachments/${attachmentId}/`))
      .then(() => undefined)
      .catch(rethrow);
  }
}

export const technicalVisitService = new TechnicalVisitService();
