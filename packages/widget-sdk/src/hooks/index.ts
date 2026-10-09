import { useState, useEffect, useCallback } from "react";
import { workerItemsApi } from "../api/worker-items";
import { intakesApi } from "../api/intakes";
import { actionsApi } from "../api/actions";
import { statsApi } from "../api/stats";
import { usersApi } from "../api/users";
import { entitiesApi } from "../api/entities";
import type {
  WorkerItem,
  WorkerItemFilters,
  Intake,
  IntakeFilters,
  Action,
  ActionFilters,
  StatsOverview,
  User,
  UserFilters,
  Entity,
  EntityFilters,
  PaginatedResponse,
  WidgetQueryResult,
} from "../types";

type AsyncState<T> = Omit<WidgetQueryResult<T>, "refetch">;

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): WidgetQueryResult<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });

  const run = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((e: any) => setState({ data: null, loading: false, error: e?.message ?? "Error" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  return { ...state, refetch: run };
}

// ── WorkerItems ───────────────────────────────────────────────────────────────

/**
 * Lista chamados e refaz a consulta quando os filtros mudam.
 * @permission worker-items.read
 * @param filters Filtros e paginação de `workerItemsApi.find`.
 * @returns `{ data, loading, error, refetch }` com uma página de chamados.
 * @example
 * const { data, loading } = useWorkerItems({ status: "started", limit: 5 });
 * if (loading) return <p>Carregando...</p>;
 * return <ul>{data?.data.map((c) => <li key={c.id}>{c.name}</li>)}</ul>;
 */
export function useWorkerItems(filters?: WorkerItemFilters): WidgetQueryResult<PaginatedResponse<WorkerItem>> {
  return useAsync(() => workerItemsApi.find(filters), [JSON.stringify(filters)]);
}

/**
 * Lê um chamado pelo id.
 * @permission worker-items.read
 * @param id Id do chamado.
 * @returns `{ data, loading, error, refetch }` com o chamado.
 * @example
 * const { data: chamado } = useWorkerItem(id);
 */
export function useWorkerItem(id: string): WidgetQueryResult<WorkerItem> {
  return useAsync(() => workerItemsApi.findById(id), [id]);
}

// ── Intakes ───────────────────────────────────────────────────────────────────

/**
 * Lista solicitações da triagem.
 * @permission intakes.read
 * @param filters Filtros e paginação de `intakesApi.find`.
 * @returns `{ data, loading, error, refetch }` com uma página de solicitações.
 * @example
 * const { data } = useIntakes({ limit: 10 });
 */
export function useIntakes(filters?: IntakeFilters): WidgetQueryResult<PaginatedResponse<Intake>> {
  return useAsync(() => intakesApi.find(filters), [JSON.stringify(filters)]);
}

/**
 * Lê uma solicitação pelo id.
 * @permission intakes.read
 * @param id Id da solicitação.
 * @returns `{ data, loading, error, refetch }` com a solicitação.
 * @example
 * const { data: solicitacao } = useIntake(id);
 */
export function useIntake(id: string): WidgetQueryResult<Intake> {
  return useAsync(() => intakesApi.findById(id), [id]);
}

// ── Actions ───────────────────────────────────────────────────────────────────

/**
 * Lista ações (chamados na visão resumida).
 * @permission actions.read
 * @param filters Filtros e paginação de `actionsApi.find`.
 * @returns `{ data, loading, error, refetch }` com uma página de ações.
 * @example
 * const { data } = useActions({ entity_id: entidadeId });
 */
export function useActions(filters?: ActionFilters): WidgetQueryResult<PaginatedResponse<Action>> {
  return useAsync(() => actionsApi.find(filters), [JSON.stringify(filters)]);
}

/**
 * Lê uma ação pelo id.
 * @permission actions.read
 * @param id Id do chamado.
 * @returns `{ data, loading, error, refetch }` com a ação.
 * @example
 * const { data: acao } = useAction(id);
 */
export function useAction(id: string): WidgetQueryResult<Action> {
  return useAsync(() => actionsApi.findById(id), [id]);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

/**
 * Visão geral do espaço: chamados abertos e fechados, solicitações e ações.
 * @permission stats.read
 * @param filters Espaço da consulta. Sem ele, vale o espaço aberto.
 * @returns `{ data, loading, error, refetch }` com os totais.
 * @example
 * const { data } = useStats();
 * return <strong>{data?.worker_items_open ?? 0} abertos</strong>;
 */
export function useStats(filters?: { workspace_slug?: string }): WidgetQueryResult<StatsOverview> {
  return useAsync(() => statsApi.overview(filters), [JSON.stringify(filters)]);
}

// ── Entities ──────────────────────────────────────────────────────────────────

/**
 * Lista entidades (clientes).
 * @permission entities.read
 * @param filters Busca, paginação e inclusão das inativas.
 * @returns `{ data, loading, error, refetch }` com uma página de entidades.
 * @example
 * const { data } = useEntities({ search: busca });
 */
export function useEntities(filters?: EntityFilters): WidgetQueryResult<PaginatedResponse<Entity>> {
  return useAsync(() => entitiesApi.find(filters), [JSON.stringify(filters)]);
}

/**
 * Lê uma entidade pelo id.
 * @permission entities.read
 * @param id Id da entidade.
 * @returns `{ data, loading, error, refetch }` com a entidade.
 * @example
 * const { data: entidade } = useEntity(id);
 */
export function useEntity(id: string): WidgetQueryResult<Entity> {
  return useAsync(() => entitiesApi.findById(id), [id]);
}

// ── Users ─────────────────────────────────────────────────────────────────────

/**
 * Lista os membros do espaço.
 * @permission users.read
 * @param filters Busca e paginação.
 * @returns `{ data, loading, error, refetch }` com uma página de pessoas.
 * @example
 * const { data } = useUsers({ search: "ana" });
 */
export function useUsers(filters?: UserFilters): WidgetQueryResult<PaginatedResponse<User>> {
  return useAsync(() => usersApi.find(filters), [JSON.stringify(filters)]);
}

/**
 * Lê a pessoa logada.
 * @permission users.read
 * @returns `{ data, loading, error, refetch }` com a pessoa.
 * @example
 * const { data: eu } = useCurrentUser();
 * return <p>Olá, {eu?.display_name}</p>;
 */
export function useCurrentUser(): WidgetQueryResult<User> {
  return useAsync(() => usersApi.current(), []);
}
