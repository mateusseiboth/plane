import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

// ─────────────────────────────────────────────────────────────────────────────
// Serviço dos relatórios gerenciais — 1 método por endpoint do módulo `reports`
// do backend (apps/api-ts/src/modules/reports). Todos aceitam filtros opcionais
// de período (date_from/date_to), projeto (project_ids) e entidade (entity_id).
// ─────────────────────────────────────────────────────────────────────────────

export type ReportFilters = {
  project_ids?: string;
  entity_id?: string;
  date_from?: string;
  date_to?: string;
};

export class ReportsService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private fetch<T>(workspaceSlug: string, report: string, params?: ReportFilters): Promise<T | null> {
    return this.get(`/api/workspaces/${workspaceSlug}/reports/${report}/`, { params })
      .then((res) => res?.data as T)
      .catch(() => null);
  }

  ticketsOverview(slug: string, params?: ReportFilters) {
    return this.fetch<any>(slug, "tickets-overview", params);
  }
  bySystem(slug: string, params?: ReportFilters) {
    return this.fetch<any>(slug, "by-system", params);
  }
  byEntity(slug: string, params?: ReportFilters) {
    return this.fetch<any>(slug, "by-entity", params);
  }
  byPriority(slug: string, params?: ReportFilters) {
    return this.fetch<any>(slug, "by-priority", params);
  }
  byType(slug: string, params?: ReportFilters) {
    return this.fetch<any>(slug, "by-type", params);
  }
  productivity(slug: string, params?: ReportFilters) {
    return this.fetch<any>(slug, "productivity", params);
  }
  timeTracking(slug: string, params?: ReportFilters) {
    return this.fetch<any>(slug, "time-tracking", params);
  }
  interactions(slug: string, params?: ReportFilters) {
    return this.fetch<any>(slug, "interactions", params);
  }
  visitsOverview(slug: string, params?: ReportFilters) {
    return this.fetch<any>(slug, "visits-overview", params);
  }
  trends(slug: string, params?: ReportFilters) {
    return this.fetch<any>(slug, "trends", params);
  }
  backlogAging(slug: string, params?: ReportFilters) {
    return this.fetch<any>(slug, "backlog-aging", params);
  }
  sla(slug: string, params?: ReportFilters) {
    return this.fetch<any>(slug, "sla", params);
  }
  executive(slug: string, params?: ReportFilters) {
    return this.fetch<any>(slug, "executive", params);
  }

  byReportId(slug: string, reportId: string, params?: ReportFilters) {
    return this.fetch<any>(slug, reportId, params);
  }
}

const reportsService = new ReportsService();
export default reportsService;
