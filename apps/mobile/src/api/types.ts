/**
 * API domain types (snake_case to mirror the TypeScript API payloads). Only the
 * fields the app reads are typed; everything else is permitted via index access
 * where needed.
 */

export type Priority = "urgent" | "high" | "medium" | "low" | "none";
export type StateGroup = "backlog" | "unstarted" | "started" | "completed" | "cancelled" | "triage";

export type Paginated<T> = {
  total_count: number;
  next_cursor: string;
  prev_cursor: string;
  next_page_results: boolean;
  prev_page_results: boolean;
  count: number;
  results: T[];
};

export type AuthUser = {
  id: string;
  email: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string | null;
  is_superuser?: boolean;
  is_instance_admin?: boolean;
  token: string;
};

export type Me = {
  id: string;
  email: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string | null;
  is_superuser?: boolean;
  is_instance_admin?: boolean;
};

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  total_members?: number;
};

export type Project = {
  id: string;
  name: string;
  identifier: string;
  description?: string;
  logo_url?: string | null;
  workspace?: string;
};

export type State = {
  id: string;
  name: string;
  color: string;
  group: StateGroup;
  sequence?: number;
  default?: boolean;
  project_id?: string;
};

export type Label = {
  id: string;
  name: string;
  color?: string;
  project_id?: string | null;
};

export type Member = {
  id: string; // member/user id
  member?: string;
  email?: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string | null;
  role: number;
  is_active?: boolean;
};

export type Entity = {
  id: string;
  name: string;
  entity_type?: number;
  city?: string | null;
  state?: string | null;
  email?: string | null;
  phone?: string | null;
  cnpj?: string | null;
  is_active?: boolean;
};

/**
 * Contato de uma entidade — cadastro reutilizável, compartilhado com a web e
 * com o chat. Numa visita técnica é ele quem figura como responsável, a pessoa
 * que recebeu a equipe.
 */
export type EntityContact = {
  id: string;
  entity_id?: string | null;
  entity_name?: string | null;
  type_id?: string | null;
  type_name?: string | null;
  is_system_user?: boolean;
  user_id?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  /** Só dígitos, com DDI — derivado no servidor; o cliente nunca envia. */
  phone_digits?: string | null;
  photo?: string | null;
  birth_date?: string | null;
  is_active?: boolean;
  receive_messages?: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type EntityContactType = {
  id: string;
  name: string;
  is_active?: boolean;
  /** Quem opera o sistema (Usuário do Sistema, Técnico T.I.) e não só o órgão. */
  is_system_user?: boolean;
  sequence?: number;
};

/** Corpo aceito ao cadastrar/editar um contato. */
export type EntityContactDraft = {
  name: string;
  entity_id?: string | null;
  type_id?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type WorkItem = {
  id: string;
  name: string;
  description_html?: string;
  description_json?: unknown;
  priority: Priority;
  sequence_id: number;
  state_id?: string | null;
  project_id: string;
  entity_id?: string | null;
  legacy_ticket_number?: string | null;
  assignee_ids?: string[];
  label_ids?: string[];
  target_date?: string | null;
  start_date?: string | null;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
  is_draft?: boolean;
};

export type TechnicalVisit = {
  id: string;
  visit_number?: number | string | null;
  technician_id?: string | null;
  technician2_id?: string | null;
  city?: string | null;
  period?: string | null;
  scheduled_date?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  status?: number;
  summary?: string | null;
  conclusion?: string | null;
  entity_id?: string | null;
  /**
   * Texto livre herdado do SAC com quem recebeu a equipe. Continua sendo
   * devolvido pela API e é somente leitura: não dá para reconstituir esses
   * nomes em pessoas do cadastro. Os responsáveis atuais são `contact_records`.
   */
  contacts?: string | null;
  /** Responsáveis vinculados à visita (resposta da API). */
  contact_records?: EntityContact[];
  /** Vínculo enviado no POST/PATCH da visita. */
  contact_ids?: string[];
  mot_update?: boolean;
  mot_bug_fix?: boolean;
  mot_training?: boolean;
  mot_improvement?: boolean;
  mot_other?: boolean;
  mot_other_description?: string | null;
  mot_commercial?: boolean;
  issue_ids?: string[];
};

export type WikiPage = {
  id: string;
  name: string;
  description_html?: string;
  updated_at?: string;
  is_locked?: boolean;
  archived_at?: string | null;
};

export type AppNotification = {
  id: string;
  title?: string;
  data?: Record<string, unknown>;
  message?: string | null;
  message_html?: string | null;
  read_at?: string | null;
  created_at?: string;
};

export type SearchResults = {
  issues: SearchHit[];
  intakes: SearchHit[];
  projects: { id: string; name: string; identifier: string }[];
  pages: { id: string; name: string }[];
  cycles: { id: string; name: string; projectId?: string }[];
  modules: { id: string; name: string; projectId?: string }[];
};

/** Raw (camelCase) issue shape returned by the "my workspace dashboard" endpoint. */
export type DashboardIssue = {
  id: string;
  name: string;
  priority: Priority;
  sequenceId?: number;
  legacyTicketNumber?: string | null;
  projectId: string;
  stateId?: string | null;
  state?: { name: string; group: StateGroup; color?: string } | null;
};

export type DashboardResponse = {
  issues: DashboardIssue[];
  workspace_id?: string;
};

export type SearchHit = {
  id: string;
  name: string;
  type: "issue" | "intake";
  sequence_id?: number;
  legacy_ticket_number?: string | null;
  priority?: Priority;
  state?: { name: string; group: StateGroup } | null;
  project?: { id: string; identifier: string; name: string } | null;
};
