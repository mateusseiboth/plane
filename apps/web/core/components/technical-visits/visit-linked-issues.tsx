/**
 * Chamados vinculados à visita, com busca para vincular. A busca é a mesma da
 * paleta (`/search/`): acha por título, número do SAC e `ESIC-12`.
 */
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Link2, Search, X } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";
import useDebounce from "@/hooks/use-debounce";
import { technicalVisitService } from "@/services/technical-visit.service";
import { WorkspaceService } from "@/services/workspace.service";
import type { TTechnicalVisit, TVisitApiError } from "./types";
import { INPUT_CLASS, VisitFieldError } from "./visit-display";

const workspaceService = new WorkspaceService();

type Props = {
  workspaceSlug: string;
  visit: TTechnicalVisit;
  editable: boolean;
  error?: string;
  onChange: (visit: TTechnicalVisit) => void;
};

const onErro = (titulo: string) => (erro: unknown) =>
  setToast({ type: TOAST_TYPE.ERROR, title: titulo, message: (erro as TVisitApiError)?.detail });

function useIssueSearch(workspaceSlug: string, termo: string) {
  const { data, isLoading } = useSWR(
    termo.trim().length >= 2 ? ["VISIT_ISSUE_SEARCH", workspaceSlug, termo] : null,
    () => workspaceService.searchWorkspace(workspaceSlug, { search: termo, workspace_search: true })
  );
  return { issues: data?.results?.issue ?? [], isLoading };
}

export function VisitLinkedIssues({ workspaceSlug, visit, editable, error, onChange }: Props) {
  const [termo, setTermo] = useState("");
  const busca = useDebounce(termo, 300);
  const { issues: encontrados, isLoading } = useIssueSearch(workspaceSlug, busca);
  const vinculados = new Set(visit.issue_ids);

  const onLink = (issueId: string) =>
    technicalVisitService
      .linkIssue(workspaceSlug, visit.id, issueId)
      .then((atualizada) => {
        onChange(atualizada);
        return setTermo("");
      })
      .catch(onErro("Não foi possível vincular o chamado."));

  const onUnlink = (issueId: string) =>
    technicalVisitService
      .unlinkIssue(workspaceSlug, visit.id, issueId)
      .then(() =>
        onChange({
          ...visit,
          issues: visit.issues.filter((i) => i.id !== issueId),
          issue_ids: visit.issue_ids.filter((id) => id !== issueId),
        })
      )
      .catch(onErro("Não foi possível desvincular o chamado."));

  return (
    <section>
      <div className="mb-3 flex items-center gap-2 text-13 font-medium">
        <Link2 className="h-4 w-4 text-secondary" />
        Chamados vinculados
      </div>
      {visit.issues.length === 0 && <p className="text-12 text-tertiary">Nenhum chamado vinculado.</p>}
      <ul className="divide-y divide-subtle rounded border border-subtle">
        {visit.issues.map((issue) => (
          <li key={issue.id} className="flex items-center gap-3 px-3 py-2 text-13">
            <Link
              href={`/${workspaceSlug}/browse/${issue.code}`}
              className="shrink-0 font-medium text-accent-primary hover:underline"
            >
              {issue.code}
            </Link>
            <span className="min-w-0 flex-1 truncate">{issue.name}</span>
            <span className={cn("shrink-0 text-11", issue.is_open ? "text-warning-primary" : "text-success-primary")}>
              {issue.state?.name ?? (issue.is_open ? "Aberto" : "Concluído")}
            </span>
            {editable && (
              <button
                type="button"
                onClick={() => onUnlink(issue.id)}
                className="shrink-0 rounded p-1 text-tertiary hover:text-primary"
                aria-label={`Desvincular ${issue.code}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <VisitFieldError message={error} />
      {editable && (
        <div className="relative mt-3">
          <Search className="absolute top-2.5 left-3 h-4 w-4 text-tertiary" />
          <input
            className={cn(INPUT_CLASS, "pl-9")}
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar chamado para vincular"
          />
          {busca.trim().length >= 2 && (
            <ul className="shadow-lg absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded border border-subtle bg-surface-1">
              {isLoading && <li className="px-3 py-2 text-12 text-tertiary">Buscando...</li>}
              {!isLoading && encontrados.length === 0 && (
                <li className="px-3 py-2 text-12 text-tertiary">Nenhum chamado encontrado.</li>
              )}
              {encontrados
                .filter((issue) => !vinculados.has(issue.id))
                .map((issue) => (
                  <li key={issue.id}>
                    <button
                      type="button"
                      onClick={() => onLink(issue.id)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-13 hover:bg-surface-2"
                    >
                      <span className="shrink-0 font-medium">
                        {issue.project__identifier}-{issue.sequence_id}
                      </span>
                      <span className="truncate">{issue.name}</span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
