export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  total: number;
  total_pages: number;
}

export interface WorkerItem {
  id: string;
  sequence_id: number;
  name: string;
  description_html?: string | null;
  priority: "urgent" | "high" | "medium" | "low" | "none";
  state: { id: string; name: string; group: string } | null;
  assignees: Array<{ id: string; display_name: string; email?: string }>;
  labels: Array<{ id: string; name: string; color: string }>;
  entity_id: string | null;
  project_id: string;
  workspace_id: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface WorkerItemFilters {
  workspace_slug?: string;
  entity_id?: string;
  status?: string;
  assignee_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface WorkerItemStats {
  total: number;
  open: number;
  closed: number;
  by_priority: Record<string, number>;
}

export interface Intake {
  id: string;
  name: string;
  description: string | null;
  project_id: string;
  workspace_id: string;
  created_at: string;
  updated_at: string;
}

export interface IntakeFilters {
  workspace_slug?: string;
  project_id?: string;
  status?: number;
  page?: number;
  limit?: number;
}

export interface IntakeStats {
  total: number;
}

export interface Action {
  id: string;
  name: string;
  priority: string;
  state: { id: string; name: string; group: string } | null;
  entity_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActionFilters {
  workspace_slug?: string;
  entity_id?: string;
  assignee_id?: string;
  page?: number;
  limit?: number;
}

export interface ActionStats {
  total: number;
  open: number;
  closed: number;
}

export interface StatsOverview {
  worker_items_total: number;
  worker_items_open: number;
  worker_items_closed: number;
  intakes_total: number;
  actions_total: number;
}

export interface EntityStats {
  entity_id: string;
  total: number;
  open: number;
  closed: number;
}

export interface PeriodStats {
  start_date: string;
  end_date: string;
  worker_items_created: number;
  worker_items_completed: number;
}

export interface User {
  id: string;
  email: string;
  display_name: string;
  first_name?: string;
  last_name?: string;
  avatar_url: string | null;
}

export interface UserFilters {
  search?: string;
  page?: number;
  limit?: number;
}

export interface Entity {
  id: string;
  name: string;
  entity_type: number | null;
  city: string | null;
  state: string | null;
  workspace_id: string;
  created_at: string;
}

export interface EntityFilters {
  workspace_slug?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ModalConfig {
  title: string;
  content: React.ReactNode | string;
  onClose?: () => void;
  size?: "sm" | "md" | "lg";
}

export interface DrawerConfig {
  title: string;
  content: React.ReactNode | string;
  onClose?: () => void;
  position?: "left" | "right";
}

export interface ConfirmConfig {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

export interface SDKInitOptions {
  baseUrl: string;
  pluginId: string;
}

// ── Plugin graphical surfaces ───────────────────────────────────────────────

export interface SidebarItem {
  /** Stable id (used as a React key and for removal). */
  id: string;
  label: string;
  /** lucide-react icon name (optional). */
  icon?: string;
  /** Page path (relative to the plugin) opened on click. */
  page: string;
  /** Lower sorts first. */
  order?: number;
}

export type PageComponent = (props: Record<string, unknown>) => unknown;

export interface PageDefinition {
  /** Path segment, relative to the plugin root (e.g. "dashboard"). */
  path: string;
  /** Document / header title. */
  title: string;
  /** Bundle export name to mount (default: "default"). */
  component?: string;
}

export interface PluginContributions {
  sidebar: SidebarItem[];
  pages: PageDefinition[];
}
