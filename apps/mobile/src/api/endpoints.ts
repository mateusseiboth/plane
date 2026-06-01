/**
 * Typed endpoint helpers grouped by domain. Paths target the gateway's
 * `/api/v1/*` routes (and `/auth/*` for sign-in). Keep these in sync with the
 * TypeScript API module prefixes.
 */
import { api, QueryParams } from "./client";
import {
  AppNotification,
  AuthUser,
  DashboardResponse,
  Entity,
  Label,
  Me,
  Member,
  Paginated,
  Project,
  SearchResults,
  State,
  TechnicalVisit,
  WikiPage,
  WorkItem,
  Workspace,
} from "./types";

const V1 = "/api/v1";

export const endpoints = {
  auth: {
    signIn: (email: string, password: string) =>
      api.post<AuthUser>("/auth/sign-in/", { email, password }, { anonymous: true }),
    signOut: () => api.post<unknown>("/auth/sign-out/"),
  },

  users: {
    me: () => api.get<Me>(`${V1}/users/me/`),
    workspaces: () => api.get<Workspace[]>(`${V1}/users/me/workspaces/`),
    projectRoles: (slug: string) =>
      api.get<Record<string, number>>(`${V1}/users/me/workspaces/${slug}/project-roles/`),
    dashboard: (slug: string) => api.get<DashboardResponse>(`${V1}/users/me/workspaces/${slug}/dashboard/`),
  },

  workspaces: {
    projects: (slug: string) => api.get<Project[]>(`${V1}/workspaces/${slug}/projects/`),
    members: (slug: string) => api.get<Member[]>(`${V1}/workspaces/${slug}/members/`),
    me: (slug: string) => api.get<Member>(`${V1}/workspaces/${slug}/members/me/`),
  },

  projects: {
    states: (slug: string, projectId: string) =>
      api.get<State[]>(`${V1}/workspaces/${slug}/projects/${projectId}/states/`),
    members: (slug: string, projectId: string) =>
      api.get<Member[]>(`${V1}/workspaces/${slug}/projects/${projectId}/members/`),
    labels: (slug: string, projectId: string) =>
      api.get<Label[]>(`${V1}/workspaces/${slug}/projects/${projectId}/labels/`),
  },

  issues: {
    list: (slug: string, projectId: string, params?: QueryParams) =>
      api.get<Paginated<WorkItem>>(`${V1}/workspaces/${slug}/projects/${projectId}/issues/`, { params }),
    get: (slug: string, projectId: string, issueId: string) =>
      api.get<WorkItem>(`${V1}/workspaces/${slug}/projects/${projectId}/issues/${issueId}/`),
    create: (slug: string, projectId: string, body: Partial<WorkItem>) =>
      api.post<WorkItem>(`${V1}/workspaces/${slug}/projects/${projectId}/issues/`, body),
    update: (slug: string, projectId: string, issueId: string, body: Partial<WorkItem>) =>
      api.patch<WorkItem>(`${V1}/workspaces/${slug}/projects/${projectId}/issues/${issueId}/`, body),
    attachments: (slug: string, projectId: string, issueId: string) =>
      api.get<unknown[]>(`${V1}/workspaces/${slug}/projects/${projectId}/issues/${issueId}/attachments/`),
    uploadAttachment: (slug: string, projectId: string, issueId: string, form: FormData) =>
      api.post<unknown>(`${V1}/workspaces/${slug}/projects/${projectId}/issues/${issueId}/attachments/`, form),
  },

  intake: {
    list: (slug: string, projectId: string, params?: QueryParams) =>
      api.get<Paginated<WorkItem>>(
        `${V1}/workspaces/${slug}/projects/${projectId}/intake-work-items/`,
        { params },
      ),
    get: (slug: string, projectId: string, issueId: string) =>
      api.get<WorkItem>(`${V1}/workspaces/${slug}/projects/${projectId}/intake-work-items/${issueId}/`),
    update: (slug: string, projectId: string, issueId: string, body: Partial<WorkItem>) =>
      api.patch<WorkItem>(
        `${V1}/workspaces/${slug}/projects/${projectId}/intake-work-items/${issueId}/`,
        body,
      ),
    // Real intake creation = an inbox issue in triage with pending status (-2),
    // awaiting approval — same flow the web uses.
    create: (slug: string, projectId: string, issue: Partial<WorkItem>) =>
      api.post<{ id: string }>(`${V1}/workspaces/${slug}/projects/${projectId}/inbox-issues/`, { issue }),
    // status: 1 = accepted (promoted to the project's default state), -1 = declined.
    setStatus: (slug: string, projectId: string, inboxId: string, status: 1 | -1, issue?: Partial<WorkItem>) =>
      api.patch<unknown>(`${V1}/workspaces/${slug}/projects/${projectId}/inbox-issues/${inboxId}/`, { status, ...(issue ? { issue } : {}) }),
  },

  entities: {
    list: (slug: string) => api.get<Entity[]>(`${V1}/workspaces/${slug}/entities/`),
    get: (slug: string, id: string) => api.get<Entity>(`${V1}/workspaces/${slug}/entities/${id}/`),
    create: (slug: string, body: Partial<Entity>) =>
      api.post<Entity>(`${V1}/workspaces/${slug}/entities/`, body),
    update: (slug: string, id: string, body: Partial<Entity>) =>
      api.patch<Entity>(`${V1}/workspaces/${slug}/entities/${id}/`, body),
  },

  visits: {
    list: (slug: string, params?: QueryParams) =>
      api.get<TechnicalVisit[]>(`${V1}/workspaces/${slug}/technical-visits/`, { params }),
    get: (slug: string, id: string) =>
      api.get<TechnicalVisit>(`${V1}/workspaces/${slug}/technical-visits/${id}/`),
    create: (slug: string, body: Partial<TechnicalVisit>) =>
      api.post<TechnicalVisit>(`${V1}/workspaces/${slug}/technical-visits/`, body),
    update: (slug: string, id: string, body: Partial<TechnicalVisit>) =>
      api.patch<TechnicalVisit>(`${V1}/workspaces/${slug}/technical-visits/${id}/`, body),
    report: (slug: string, params?: QueryParams) =>
      api.get<unknown>(`${V1}/workspaces/${slug}/technical-visits/report/`, { params }),
  },

  pages: {
    list: (slug: string) => api.get<WikiPage[]>(`${V1}/workspaces/${slug}/pages/`),
    get: (slug: string, id: string) => api.get<WikiPage>(`${V1}/workspaces/${slug}/pages/${id}/`),
    create: (slug: string, body: Partial<WikiPage>) =>
      api.post<WikiPage>(`${V1}/workspaces/${slug}/pages/`, body),
    update: (slug: string, id: string, body: Partial<WikiPage>) =>
      api.patch<WikiPage>(`${V1}/workspaces/${slug}/pages/${id}/`, body),
  },

  notifications: {
    list: (slug: string, params?: QueryParams) =>
      api.get<Paginated<AppNotification> | AppNotification[]>(
        `${V1}/workspaces/${slug}/users/notifications/`,
        { params },
      ),
    unread: (slug: string) =>
      api.get<{ count?: number }>(`${V1}/workspaces/${slug}/users/notifications/unread/`),
    markAllRead: (slug: string) =>
      api.post<unknown>(`${V1}/workspaces/${slug}/users/notifications/mark-all-read/`),
  },

  search: {
    global: (slug: string, q: string) =>
      api.get<{ results: SearchResults }>(`${V1}/workspaces/${slug}/global-search/`, { params: { q } }),
    reindex: (slug: string) => api.post<unknown>(`${V1}/workspaces/${slug}/search/reindex/`),
  },
};
