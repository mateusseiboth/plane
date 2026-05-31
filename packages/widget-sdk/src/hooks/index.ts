import { useState, useEffect, useCallback } from "react";
import { workerItemsApi } from "../api/worker-items";
import { intakesApi } from "../api/intakes";
import { actionsApi } from "../api/actions";
import { statsApi } from "../api/stats";
import { usersApi } from "../api/users";
import { entitiesApi } from "../api/entities";
import type {
  WorkerItem, WorkerItemFilters, WorkerItemStats,
  Intake, IntakeFilters, IntakeStats,
  Action, ActionFilters, ActionStats,
  StatsOverview, EntityStats, PeriodStats,
  User, UserFilters,
  Entity, EntityFilters,
  PaginatedResponse,
} from "../types";

type AsyncState<T> = { data: T | null; loading: boolean; error: string | null };

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> & { refetch: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });

  const run = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((e: any) => setState({ data: null, loading: false, error: e?.message ?? "Error" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { run(); }, [run]);

  return { ...state, refetch: run };
}

// ── WorkerItems ───────────────────────────────────────────────────────────────

export function useWorkerItems(filters?: WorkerItemFilters) {
  return useAsync(() => workerItemsApi.find(filters), [JSON.stringify(filters)]);
}

export function useWorkerItem(id: string) {
  return useAsync(() => workerItemsApi.findById(id), [id]);
}

// ── Intakes ───────────────────────────────────────────────────────────────────

export function useIntakes(filters?: IntakeFilters) {
  return useAsync(() => intakesApi.find(filters), [JSON.stringify(filters)]);
}

export function useIntake(id: string) {
  return useAsync(() => intakesApi.findById(id), [id]);
}

// ── Actions ───────────────────────────────────────────────────────────────────

export function useActions(filters?: ActionFilters) {
  return useAsync(() => actionsApi.find(filters), [JSON.stringify(filters)]);
}

export function useAction(id: string) {
  return useAsync(() => actionsApi.findById(id), [id]);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export function useStats(filters?: { workspace_slug?: string }) {
  return useAsync(() => statsApi.overview(filters), [JSON.stringify(filters)]);
}

// ── Entities ──────────────────────────────────────────────────────────────────

export function useEntities(filters?: EntityFilters) {
  return useAsync(() => entitiesApi.find(filters), [JSON.stringify(filters)]);
}

export function useEntity(id: string) {
  return useAsync(() => entitiesApi.findById(id), [id]);
}

// ── Users ─────────────────────────────────────────────────────────────────────

export function useUsers(filters?: UserFilters) {
  return useAsync(() => usersApi.find(filters), [JSON.stringify(filters)]);
}

export function useCurrentUser() {
  return useAsync(() => usersApi.current(), []);
}
