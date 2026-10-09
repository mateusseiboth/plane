import { sdkFetch } from "../http";
import type { PaginatedResponse, Entity, EntityFilters } from "../types";

/**
 * Entidades: os clientes atendidos no espaço.
 * @permission entities.read
 */
export const entitiesApi = {
  /**
   * Lista entidades em ordem de nome. Inativas e congeladas ficam de fora, a não ser com `include_inactive`.
   * @param filters Busca, paginação e inclusão das inativas.
   * @returns Uma página de entidades.
   * @example
   * const { data } = await entitiesApi.find({ search: "prefeitura" });
   */
  find(filters?: EntityFilters): Promise<PaginatedResponse<Entity>> {
    return sdkFetch("/entities", filters as any);
  },

  /**
   * Lê uma entidade pelo id.
   * @param id Id da entidade.
   * @returns A entidade. Rejeita com 404 se não existe no espaço.
   * @example
   * const entidade = await entitiesApi.findById(id);
   */
  findById(id: string): Promise<Entity> {
    return sdkFetch(`/entities/${id}`);
  },
};
