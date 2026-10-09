import { sdkFetch } from "../http";
import type { PaginatedResponse, Action, ActionFilters, ActionStats } from "../types";

/**
 * Chamados na visão resumida de ações (sem responsáveis nem etiquetas).
 * @permission actions.read
 */
export const actionsApi = {
  /**
   * Lista ações, da última alteração para a mais antiga.
   * @param filters Filtros e paginação. Sem `workspace_slug`, vale o espaço aberto.
   * @returns Uma página de ações.
   * @example
   * const { data } = await actionsApi.find({ assignee_id: pessoaId, limit: 5 });
   */
  find(filters?: ActionFilters): Promise<PaginatedResponse<Action>> {
    return sdkFetch("/actions", filters as any);
  },

  /**
   * Lê uma ação pelo id.
   * @param id Id do chamado.
   * @returns A ação. Rejeita com 404 se não existe ou a pessoa não a enxerga.
   * @example
   * const acao = await actionsApi.findById(id);
   */
  findById(id: string): Promise<Action> {
    return sdkFetch(`/actions/${id}`);
  },

  /**
   * Totais de ações abertas e fechadas.
   * @param filters Espaço da consulta.
   * @returns Os totais.
   * @example
   * const { open, closed } = await actionsApi.stats();
   */
  stats(filters?: Pick<ActionFilters, "workspace_slug">): Promise<ActionStats> {
    return sdkFetch("/actions/stats", filters as any);
  },
};
