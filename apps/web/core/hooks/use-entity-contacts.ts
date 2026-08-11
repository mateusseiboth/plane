/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
import type { TEntityContact, TEntityContactType } from "@plane/types";
// services
import entityContactService, {
  type TEntityContactFilters,
  type TEntityContactPage,
} from "@/services/entity-contact.service";

export const ENTITY_CONTACTS_KEY = (workspaceSlug: string, filters: TEntityContactFilters) =>
  `ENTITY_CONTACTS_${workspaceSlug}_${JSON.stringify(filters)}`;

export const ENTITY_CONTACT_TYPES_KEY = (workspaceSlug: string) => `ENTITY_CONTACT_TYPES_${workspaceSlug}`;

/**
 * Contatos de um espaço, opcionalmente filtrados. A busca por nome/e-mail/
 * telefone é do servidor (o legado tem 2433 registros; filtrar no navegador
 * obrigaria a baixar todos).
 */
export const useEntityContacts = (workspaceSlug: string | undefined, filters: TEntityContactFilters = {}) => {
  const key = workspaceSlug ? ENTITY_CONTACTS_KEY(workspaceSlug, filters) : null;

  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate: refetch,
  } = useSWR<TEntityContact[]>(key, key ? () => entityContactService.list(workspaceSlug!, filters) : null, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  return {
    contacts: data ?? [],
    data,
    error,
    isLoading,
    isFetching: isValidating,
    refetch,
  };
};

/**
 * Uma página de contatos. É o que a tela de cadastro usa: com 2.433 registros,
 * a lista inteira na árvore trava a página a cada clique num dropdown.
 *
 * `keepPreviousData` deixa a página atual no lugar enquanto a próxima chega —
 * sem isso a tabela pisca em branco a cada letra digitada na busca.
 */
export const useEntityContactsPage = (
  workspaceSlug: string | undefined,
  filters: TEntityContactFilters = {},
  perPage = 50,
  cursor?: string
) => {
  const key = workspaceSlug
    ? `${ENTITY_CONTACTS_KEY(workspaceSlug, filters)}_${perPage}_${cursor ?? "primeira"}`
    : null;

  const { data, error, isLoading, isValidating, mutate } = useSWR<TEntityContactPage>(
    key,
    key ? () => entityContactService.listPage(workspaceSlug!, filters, perPage, cursor) : null,
    { revalidateOnFocus: false, keepPreviousData: true }
  );

  return {
    contacts: data?.results ?? [],
    total: data?.total ?? 0,
    nextCursor: data?.nextCursor ?? null,
    prevCursor: data?.prevCursor ?? null,
    hasNext: data?.hasNext ?? false,
    hasPrev: data?.hasPrev ?? false,
    error,
    isLoading,
    isFetching: isValidating,
    refetch: mutate,
  };
};

/** Contatos de uma entidade — atalho do contrato, cache próprio. */
export const useEntityContactsOf = (workspaceSlug: string | undefined, entityId: string | null | undefined) => {
  const key = workspaceSlug && entityId ? `ENTITY_CONTACTS_OF_${workspaceSlug}_${entityId}` : null;

  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate: refetch,
  } = useSWR<TEntityContact[]>(
    key,
    key ? () => entityContactService.listByEntity(workspaceSlug!, entityId!) : null,
    { revalidateOnFocus: false }
  );

  return {
    contacts: data ?? [],
    data,
    error,
    isLoading,
    isFetching: isValidating,
    refetch,
  };
};

/** Papéis (Prefeito, Secretário, Técnico T.I.) — lista curta e estável. */
export const useEntityContactTypes = (workspaceSlug: string | undefined) => {
  const key = workspaceSlug ? ENTITY_CONTACT_TYPES_KEY(workspaceSlug) : null;

  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate: refetch,
  } = useSWR<TEntityContactType[]>(key, key ? () => entityContactService.listTypes(workspaceSlug!) : null, {
    revalidateOnFocus: false,
  });

  return {
    types: data ?? [],
    data,
    error,
    isLoading,
    isFetching: isValidating,
    refetch,
  };
};
