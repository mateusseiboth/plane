import { sdkFetch } from "../http";
import type { PaginatedResponse, WorkerItem, WorkerItemFilters, WorkerItemStats } from "../types";

/**
 * Chamados do espaço, só dos sistemas que a pessoa enxerga.
 * @permission worker-items.read
 */
export const workerItemsApi = {
  /**
   * Lista chamados, do mais recente para o mais antigo (pela última alteração).
   * @param filters Filtros e paginação. Sem `workspace_slug`, vale o espaço aberto.
   * @returns Uma página de chamados.
   * @example
   * const pagina = await workerItemsApi.find({ status: "started", limit: 10 });
   * console.log(pagina.total, pagina.data[0]?.name);
   */
  find(filters?: WorkerItemFilters): Promise<PaginatedResponse<WorkerItem>> {
    return sdkFetch("/worker-items", filters as any);
  },

  /**
   * Lê um chamado pelo id.
   * @param id Id do chamado.
   * @returns O chamado. Rejeita com 404 se não existe ou a pessoa não o enxerga.
   * @example
   * const chamado = await workerItemsApi.findById("0190f7c2-...");
   */
  findById(id: string): Promise<WorkerItem> {
    return sdkFetch(`/worker-items/${id}`);
  },

  /**
   * Totais de chamados: abertos, fechados e por prioridade.
   * @param filters Espaço e, opcionalmente, uma entidade.
   * @returns Os totais.
   * @example
   * const { open, by_priority } = await workerItemsApi.stats({ entity_id: entidadeId });
   */
  stats(filters?: Pick<WorkerItemFilters, "workspace_slug" | "entity_id">): Promise<WorkerItemStats> {
    return sdkFetch("/worker-items/stats", filters as any);
  },
};
