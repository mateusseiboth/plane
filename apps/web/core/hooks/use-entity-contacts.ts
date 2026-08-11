/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
import type { TEntityContact, TEntityContactType } from "@plane/types";
// services
import entityContactService, { type TEntityContactFilters } from "@/services/entity-contact.service";

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
