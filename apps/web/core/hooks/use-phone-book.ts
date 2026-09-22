/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
// services
import phoneBookService, { type TPhoneBookEntry } from "@/services/phone-book.service";

export const PHONE_BOOK_KEY = (workspaceSlug: string) => `PHONE_BOOK_${workspaceSlug}`;

/** Agenda dos colegas ativos do espaço, de A a Z. */
export const usePhoneBook = (workspaceSlug: string | undefined) => {
  const key = workspaceSlug ? PHONE_BOOK_KEY(workspaceSlug) : null;
  const { data, error, isLoading, isValidating, mutate } = useSWR<TPhoneBookEntry[]>(
    key,
    key ? () => phoneBookService.list(workspaceSlug!) : null,
    { revalidateOnFocus: false }
  );
  return { entries: data ?? [], data, error, isLoading, isFetching: isValidating, refetch: mutate };
};
