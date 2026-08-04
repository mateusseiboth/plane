/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import useSWR from "swr";
// services
import {
  auditService,
  type TAuditFilters,
  type TAuditLogPage,
  type TClientAuditAction,
} from "@/services/audit.service";

type UseAuditLogsOptions = {
  /** `true` consulta apenas os próprios acessos (direito do titular). */
  onlyMine?: boolean;
  enabled?: boolean;
};

/** Consulta paginada da trilha de auditoria (LGPD). */
export function useAuditLogs(
  workspaceSlug: string | undefined,
  filters: TAuditFilters = {},
  options: UseAuditLogsOptions = {}
) {
  const { onlyMine = false, enabled = true } = options;
  const key =
    workspaceSlug && enabled
      ? `AUDIT_LOGS_${onlyMine ? "MINE_" : ""}${workspaceSlug}_${JSON.stringify(filters)}`
      : null;

  const { data, error, isLoading, isValidating, mutate } = useSWR<TAuditLogPage>(
    key,
    key
      ? () => (onlyMine ? auditService.listMine(workspaceSlug!, filters) : auditService.list(workspaceSlug!, filters))
      : null,
    { revalidateOnFocus: false }
  );

  return {
    logs: data?.results ?? [],
    totalCount: data?.total_count ?? 0,
    hasNextPage: data?.next_page_results ?? false,
    nextCursor: data?.next_cursor,
    data,
    error,
    isLoading,
    isFetching: isValidating,
    refetch: mutate,
  };
}

/**
 * Registra ações que só existem no navegador (imprimir, exportar). Falha aqui
 * nunca interrompe o que o usuário está fazendo.
 */
export function useAuditRecorder(workspaceSlug: string | undefined) {
  return useCallback(
    (action: TClientAuditAction, entity: string, entityId: string, metadata?: Record<string, unknown>) => {
      if (!workspaceSlug || !entityId) return;
      void auditService.record(workspaceSlug, { action, entity, entity_id: entityId, metadata });
    },
    [workspaceSlug]
  );
}
