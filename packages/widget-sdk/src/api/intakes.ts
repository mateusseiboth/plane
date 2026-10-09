import { sdkFetch } from "../http";
import type { PaginatedResponse, Intake, IntakeFilters, IntakeStats } from "../types";

/**
 * Solicitações da triagem, só dos sistemas que a pessoa enxerga.
 * @permission intakes.read
 */
export const intakesApi = {
  /**
   * Lista solicitações, das mais novas para as mais antigas.
   * @param filters Filtros e paginação. Sem `workspace_slug`, vale o espaço aberto.
   * @returns Uma página de solicitações.
   * @example
   * const { data } = await intakesApi.find({ project_id: sistemaId });
   */
  find(filters?: IntakeFilters): Promise<PaginatedResponse<Intake>> {
    return sdkFetch("/intakes", filters as any);
  },

  /**
   * Lê uma solicitação pelo id.
   * @param id Id da solicitação.
   * @returns A solicitação. Rejeita com 404 se não existe ou a pessoa não a enxerga.
   * @example
   * const solicitacao = await intakesApi.findById(id);
   */
  findById(id: string): Promise<Intake> {
    return sdkFetch(`/intakes/${id}`);
  },

  /**
   * Total de solicitações visíveis.
   * @param filters Espaço da consulta.
   * @returns O total.
   * @example
   * const { total } = await intakesApi.stats();
   */
  stats(filters?: Pick<IntakeFilters, "workspace_slug">): Promise<IntakeStats> {
    return sdkFetch("/intakes/stats", filters as any);
  },
};
