import { sdkFetch } from "../http";
import type { PaginatedResponse, User, UserFilters } from "../types";

/**
 * A pessoa logada e os membros do espaço.
 * @permission users.read
 */
export const usersApi = {
  /**
   * Lê a pessoa logada. Não depende do espaço.
   * @returns A pessoa logada.
   * @example
   * const eu = await usersApi.current();
   */
  current(): Promise<User> {
    return sdkFetch("/users/me");
  },

  /**
   * Lista os membros do espaço, em ordem de nome.
   * @param filters Busca e paginação.
   * @returns Uma página de pessoas.
   * @example
   * const { data } = await usersApi.find({ search: "ana" });
   */
  find(filters?: UserFilters): Promise<PaginatedResponse<User>> {
    return sdkFetch("/users", filters as any);
  },

  /**
   * Lê um membro do espaço pelo id.
   * @param id Id da pessoa.
   * @returns A pessoa. Rejeita com 404 se ela não participa do espaço.
   * @example
   * const pessoa = await usersApi.findById(id);
   */
  findById(id: string): Promise<User> {
    return sdkFetch(`/users/${id}`);
  },
};
