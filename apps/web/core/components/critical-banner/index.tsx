"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, ChevronDown, ChevronUp, X } from "lucide-react";
import { cn } from "@plane/utils";
import { APIService } from "@/services/api.service";
import { API_BASE_URL } from "@plane/constants";

class UrgentIssueService extends APIService {
  constructor() { super(API_BASE_URL); }
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

/**
 * CriticalIssuesBanner — shown at the top of all workspace pages whenever
 * there are urgent issues not yet completed/cancelled.
 * Polls every 60 s. Collapses to save space.
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
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [workspaceSlug]);

  if (dismissed || issues.length === 0) return null;

  return (
    <div className={cn("w-full border-b border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/30 transition-all")}>
      <div className="flex items-center gap-3 px-4 py-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
        <span className="text-13 font-semibold text-red-800 dark:text-red-300">
          {issues.length} chamado{issues.length !== 1 ? "s" : ""} URGENTE{issues.length !== 1 ? "S" : ""} em aberto
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-12 text-red-700 hover:bg-red-100 dark:text-red-300"
          >
            {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            {collapsed ? "Expandir" : "Recolher"}
          </button>
          <button
            onClick={() => setDismissed(true)}
            title="Dispensar (reaparece após a próxima atualização)"
            className="rounded p-0.5 text-red-600 hover:bg-red-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="border-t border-red-200 dark:border-red-800">
          <div className="flex flex-wrap gap-2 px-4 py-2">
            {issues.slice(0, 8).map((issue) => (
              <Link
                key={issue.id}
                href={`/${workspaceSlug}/projects/${issue.project?.id}/issues/${issue.id}/`}
                className="flex items-center gap-1.5 rounded-full border border-red-300 bg-white px-3 py-1 text-12 text-red-800 hover:border-red-500 hover:bg-red-50 dark:border-red-700 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900/50 transition-colors"
              >
                {issue.legacy_ticket_number && (
                  <span className="font-mono font-semibold">#{issue.legacy_ticket_number}</span>
                )}
                {issue.project?.identifier && (
                  <span className="font-medium text-red-500">{issue.project.identifier}-{issue.sequence_id}</span>
                )}
                <span className="max-w-[200px] truncate">{issue.name}</span>
                {issue.state && (
                  <span className={cn("shrink-0 text-11 font-medium", STATE_GROUP_COLOR[issue.state.group] ?? "text-secondary")}>
                    · {issue.state.name}
                  </span>
                )}
              </Link>
            ))}
            {issues.length > 8 && (
              <span className="flex items-center px-2 text-12 text-red-600">
                +{issues.length - 8} mais
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
