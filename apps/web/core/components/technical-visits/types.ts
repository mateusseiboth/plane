/**
 * Contrato da visita técnica como a API devolve (`apps/api-ts/src/modules/
 * technical-visit/visit-serializer.ts`). Fonte única do tipo no frontend: tela,
 * serviço e documentos de impressão usam este.
 */
import type { TEntityContact } from "@plane/types";

export type TVisitTechnician = {
  id: string;
  display_name: string;
  first_name?: string;
  last_name?: string;
};

export type TVisitLinkedIssue = {
  id: string;
  name: string;
  sequence_id: number;
  project_id: string;
  project_identifier: string | null;
  code: string;
  state: { name: string; group: string } | null;
  is_open: boolean;
};

export type TVisitAttachment = {
  id: string;
  name: string;
  size: number;
  mime_type: string | null;
  uploaded_by: string | null;
  created_at: string | null;
};

export type TVisitProject = { id: string; name: string; identifier: string };

export type TVisitModule = { id: string; name: string; project_id: string };

export type TTechnicalVisit = {
  id: string;
  visit_number: string | null;
  status: number;
  status_label: string;
  is_overdue: boolean;
  technician_id: string | null;
  technician2_id: string | null;
  technician: TVisitTechnician | null;
  technician2: TVisitTechnician | null;
  entity_id: string | null;
  entity: { id: string; name: string; city: string | null } | null;
  /** Texto solto herdado do SAC: convive com `contact_records`. */
  contacts: string | null;
  contact_records: TEntityContact[];
  city: string | null;
  scheduled_date: string | null;
  started_at: string | null;
  finished_at: string | null;
  period: string | null;
  summary: string | null;
  conclusion: string | null;
  mot_update: boolean;
  mot_bug_fix: boolean;
  mot_training: boolean;
  mot_improvement: boolean;
  mot_commercial: boolean;
  mot_other: boolean;
  mot_other_description: string | null;
  project_ids: string[];
  module_ids: string[];
  issue_ids: string[];
  issues: TVisitLinkedIssue[];
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  /** Só no detalhe e nas respostas de escrita. */
  projects?: TVisitProject[];
  modules?: TVisitModule[];
  attachments?: TVisitAttachment[];
};

/** Qual documento da visita vai para a impressora. */
export type TVisitPrintTarget = "relatorio" | "presenca";

export type TVisitListFilters = {
  status?: number | null;
  technicianId?: string | null;
  entityId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  overdue?: boolean;
};

export type TPaginatedVisits = {
  results: TTechnicalVisit[];
  total_count: number;
  next_page_results: boolean;
  prev_page_results: boolean;
};

/** Erro de escrita da API: `errors[i].path` é o nome do campo. */
export type TVisitApiError = { detail?: string; errors?: { path: string; message: string }[] };
