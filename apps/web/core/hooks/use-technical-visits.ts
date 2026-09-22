/**
 * Dados das visitas técnicas via SWR. A tela não chama o serviço para ler:
 * usa estes hooks e, depois de gravar, `mutate` com o que a API devolveu.
 */
import useSWR from "swr";
import type { TPaginatedVisits, TTechnicalVisit, TVisitListFilters } from "@/components/technical-visits/types";
import { buildVisitListParams } from "@/components/technical-visits/visit-rules";
import { technicalVisitService } from "@/services/technical-visit.service";
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";

export const VISITAS_POR_PAGINA = 25;

export function useTechnicalVisits(workspaceSlug: string | undefined, filtros: TVisitListFilters, pagina: number) {
  const params = buildVisitListParams(filtros, pagina, VISITAS_POR_PAGINA);
  const { data, error, isLoading, isValidating, mutate } = useSWR<TPaginatedVisits>(
    workspaceSlug ? ["TECHNICAL_VISITS", workspaceSlug, JSON.stringify(params)] : null,
    () => technicalVisitService.list(workspaceSlug!, params),
    { keepPreviousData: true }
  );
  return { data, error, isLoading, isFetching: isValidating, refetch: mutate };
}

export function useTechnicalVisit(workspaceSlug: string | undefined, visitId: string | undefined) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<TTechnicalVisit>(
    workspaceSlug && visitId ? ["TECHNICAL_VISIT", workspaceSlug, visitId] : null,
    () => technicalVisitService.retrieve(workspaceSlug!, visitId!),
    { revalidateOnFocus: false }
  );
  return { data, error, isLoading, isFetching: isValidating, refetch: mutate };
}

/** `visit.manage` registra; `visit.manage.all` troca técnico e data e cancela. */
export function useVisitPermissions(workspaceSlug: string | undefined) {
  const { can, isLoading } = useMyWorkspaceActions(workspaceSlug);
  return { canRegister: can("visit.manage"), canManageAll: can("visit.manage.all"), isLoading };
}
