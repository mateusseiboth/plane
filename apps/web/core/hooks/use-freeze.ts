/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
import type { TFreezeEvent, TFrozenMember } from "@plane/types";
// services
import freezeService, { type TFreezeSubject } from "@/services/freeze.service";

export const FREEZE_EVENTS_KEY = (workspaceSlug: string, subject: TFreezeSubject, id: string) =>
  `FREEZE_EVENTS_${workspaceSlug}_${subject}_${id}`;

export const FROZEN_MEMBERS_KEY = (workspaceSlug: string) => `FROZEN_MEMBERS_${workspaceSlug}`;

/** Histórico de congelamento de uma entidade ou de um membro. */
export const useFreezeEvents = (workspaceSlug: string | undefined, subject: TFreezeSubject, id: string | undefined) => {
  const key = workspaceSlug && id ? FREEZE_EVENTS_KEY(workspaceSlug, subject, id) : null;
  const { data, error, isLoading, isValidating, mutate } = useSWR<TFreezeEvent[]>(
    key,
    key ? () => freezeService.listEvents(workspaceSlug!, subject, id!) : null,
    { revalidateOnFocus: false }
  );
  return { events: data ?? [], data, error, isLoading, isFetching: isValidating, refetch: mutate };
};

/** Membros congelados do espaço (a lista comum de membros não os mostra). */
export const useFrozenMembers = (workspaceSlug: string | undefined, enabled = true) => {
  const key = workspaceSlug && enabled ? FROZEN_MEMBERS_KEY(workspaceSlug) : null;
  const { data, error, isLoading, isValidating, mutate } = useSWR<TFrozenMember[]>(
    key,
    key ? () => freezeService.listFrozenMembers(workspaceSlug!) : null,
    { revalidateOnFocus: false }
  );
  return { members: data ?? [], data, error, isLoading, isFetching: isValidating, refetch: mutate };
};
