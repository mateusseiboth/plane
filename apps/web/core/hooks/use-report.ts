/**
 * Dados de um relatório gerencial (`/workspaces/:slug/reports/:reportId/`).
 * Mantém o resultado anterior enquanto um filtro novo carrega, para a tela não
 * piscar a cada troca.
 */
import useSWR from "swr";
import reportsService, { type ReportFilters } from "@/services/reports.service";

type TUseReportOptions = {
  /** Atualização periódica em ms (painel de TV); 0 desliga. */
  refreshInterval?: number;
};

export function useReport<T = any>(
  workspaceSlug: string | undefined,
  reportId: string | undefined,
  params: ReportFilters,
  options: TUseReportOptions = {}
) {
  const key = workspaceSlug && reportId ? ["REPORT", workspaceSlug, reportId, JSON.stringify(params)] : null;
  const { data, error, isLoading, isValidating, mutate } = useSWR<T>(
    key,
    () => reportsService.load<T>(workspaceSlug!, reportId!, params),
    { revalidateOnFocus: false, keepPreviousData: true, refreshInterval: options.refreshInterval ?? 0 }
  );

  return { data, error, isLoading, isFetching: isValidating, refetch: mutate };
}
