/**
 * Os sistemas para os quais se abre solicitação: todos do espaço, para quem
 * tem `intake.create` (ver `GET /workspaces/:slug/sistemas-para-solicitacao/`).
 * Fonte única do modal de solicitação avulsa e da solicitação da ouvidoria.
 */
import useSWR from "swr";
import { InboxIssueService } from "@/services/inbox";

const inboxIssueService = new InboxIssueService();

export function useSistemasParaSolicitacao(workspaceSlug: string | undefined, enabled: boolean) {
  const isPronto = !!workspaceSlug && enabled;
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    isPronto ? `SISTEMAS_PARA_SOLICITACAO_${workspaceSlug}` : null,
    isPronto ? () => inboxIssueService.listSistemasParaSolicitacao(workspaceSlug) : null,
    { revalidateOnFocus: false }
  );
  return { data: data ?? [], error, isLoading, isFetching: isValidating, refetch: mutate };
}
