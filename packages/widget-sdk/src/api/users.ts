import { sdkFetch } from "../http";
import type { PaginatedResponse, User, UserFilters } from "../types";

export const usersApi = {
  current(): Promise<User> {
    return sdkFetch("/users/me");
  },

  find(filters?: UserFilters): Promise<PaginatedResponse<User>> {
    return sdkFetch("/users", filters as any);
  },

  findById(id: string): Promise<User> {
    return sdkFetch(`/users/${id}`);
  },
};
