"use client";

import { buildOndeEstaNaFaixa, isEventoDaFaixaDeUrgentes } from "@/components/critical-banner/helpers";
import { useRealtimeRefetch } from "@/hooks/use-realtime";
import { formatNumeroNoSistema } from "@/helpers/numero-no-sistema.helper";
import { APIService } from "@/services/api.service";
import { API_BASE_URL } from "@plane/constants";
import { cn, generateIssueDetailLink } from "@plane/utils";
import { AlertTriangle, ChevronDown, ChevronUp, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

class UrgentIssueService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }
  list(slug: string) {
    return this.get(`/api/workspaces/${slug}/urgent-issues/`)
      .then((r) => r?.data ?? [])
      .catch(() => []);
  }
}

const urgentService = new UrgentIssueService();

const STATE_GROUP_COLOR: Record<string, string> = {
  backlog: "text-gray-500",
  unstarted: "text-blue-600",
  started: "text-yellow-600",
  completed: "text-green-600",
  cancelled: "text-gray-400",
  triage: "text-purple-600",
};

// Faixa NEUTRA, sem vermelho (pedido do dono do produto, 19/11/2026): o destaque
// do urgente fica no card do quadro e na linha da lista. Cores só pelos tokens do
// tema, que zera a paleta padrão do Tailwind (`--color-*: initial`).

/**
 * CriticalIssuesBanner — shown at the top of all workspace pages whenever
 * there are urgent issues not yet completed/cancelled.
 * Revalidates on the realtime bus (priority/state change, create, delete) and
 * still polls every 60 s as a fallback. Collapses to save space.
 */
export function CriticalIssuesBanner() {
  const { workspaceSlug } = useParams();
  const [issues, setIssues] = useState<any[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = () => {
    if (!workspaceSlug) return;
    urgentService.list(workspaceSlug.toString()).then(setIssues);
  };

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [workspaceSlug]);

  // Prioridade trocada no quadro ou no detalhe reflete na faixa sem esperar o polling.
  useRealtimeRefetch(
    (event) =>
      isEventoDaFaixaDeUrgentes(
        event,
        issues.map((issue) => issue.id)
      ),
    load
  );

  if (dismissed || issues.length === 0) return null;

  return (
    <div className="w-full border-b border-subtle bg-surface-2 transition-all">
      <div className="flex items-center gap-3 px-4 py-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-secondary" />
        <span className="text-13 font-semibold text-primary">
          {issues.length} chamado{issues.length !== 1 ? "s" : ""} URGENTE{issues.length !== 1 ? "S" : ""} em aberto
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-12 text-secondary hover:bg-layer-1-hover"
          >
            {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            {collapsed ? "Expandir" : "Recolher"}
          </button>
          <button
            onClick={() => setDismissed(true)}
            title="Dispensar (reaparece após a próxima atualização)"
            className="rounded p-0.5 text-secondary hover:bg-layer-1-hover"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="border-t border-subtle">
          <div className="flex flex-wrap gap-2 px-4 py-2">
            {issues.slice(0, 8).map((issue) => (
              <Link
                key={issue.id}
                href={generateIssueDetailLink({
                  workspaceSlug: workspaceSlug.toString(),
                  projectId: issue.project?.id,
                  issueId: issue.id,
                })}
                className="flex items-center gap-1.5 rounded-full border border-subtle bg-surface-1 px-3 py-1 text-12 text-primary transition-colors hover:bg-layer-1-hover"
              >
                {issue.legacy_ticket_number && (
                  <span className="font-mono rounded bg-layer-1 px-1 font-semibold text-secondary">
                    #{issue.legacy_ticket_number}
                  </span>
                )}
                {issue.project?.identifier && (
                  <span className="rounded bg-layer-1 px-1 font-medium text-secondary">
                    {formatNumeroNoSistema(issue.project, issue.sequence_id)}
                  </span>
                )}
                <span className="max-w-[200px] truncate">{issue.name}</span>
                {(issue.state || issue.setor) && (
                  <span
                    className={cn(
                      "shrink-0 text-11 font-medium",
                      STATE_GROUP_COLOR[issue.state?.group] ?? "text-secondary"
                    )}
                  >
                    · {buildOndeEstaNaFaixa(issue)}
                  </span>
                )}
              </Link>
            ))}
            {issues.length > 8 && (
              <span className="flex items-center px-2 text-12 text-secondary">+{issues.length - 8} mais</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
