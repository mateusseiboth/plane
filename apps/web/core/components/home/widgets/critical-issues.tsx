"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { THomeWidgetProps } from "@plane/types";
import { calculateTimeAgo, cn } from "@plane/utils";
import { APIService } from "@/services/api.service";
import { API_BASE_URL } from "@plane/constants";

class UrgentService extends APIService {
  constructor() { super(API_BASE_URL); }
  list(slug: string) {
    return this.get(`/api/workspaces/${slug}/urgent-issues/`).then((r) => r?.data ?? []).catch(() => []);
  }
}

const urgentService = new UrgentService();

const STATE_GROUP_BG: Record<string, string> = {
  backlog: "bg-gray-100 text-gray-700",
  unstarted: "bg-blue-100 text-blue-700",
  started: "bg-yellow-100 text-yellow-800",
  triage: "bg-purple-100 text-purple-700",
};

export function CriticalIssuesWidget({ workspaceSlug }: THomeWidgetProps) {
  const [issues, setIssues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    urgentService.list(workspaceSlug).then(setIssues).finally(() => setLoading(false));
  }, [workspaceSlug]);

  if (loading) return <div className="h-32 animate-pulse rounded-xl border border-subtle bg-surface-2" />;
  if (issues.length === 0) return null;

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/20">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-red-600" />
        <span className="text-13 font-semibold text-red-800 dark:text-red-300">
          Chamados Urgentes em Aberto ({issues.length})
        </span>
      </div>
      <div className="space-y-2">
        {issues.slice(0, 6).map((issue) => (
          <Link
            key={issue.id}
            href={`/${workspaceSlug}/projects/${issue.project?.id}/issues/${issue.id}/`}
            className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 shadow-sm hover:shadow transition-shadow dark:bg-red-900/20"
          >
            {issue.legacy_ticket_number && (
              <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-10 font-mono font-semibold text-amber-800 ring-1 ring-amber-300">
                #{issue.legacy_ticket_number}
              </span>
            )}
            {issue.project?.identifier && (
              <span className="shrink-0 text-11 font-medium text-red-500">
                {issue.project.identifier}-{issue.sequence_id}
              </span>
            )}
            <span className="flex-1 truncate text-13 text-primary">{issue.name}</span>
            {issue.state && (
              <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-10 font-medium", STATE_GROUP_BG[issue.state.group] ?? "bg-surface-2 text-secondary")}>
                {issue.state.name}
              </span>
            )}
            <span className="shrink-0 text-11 text-tertiary">{calculateTimeAgo(issue.updated_at)}</span>
          </Link>
        ))}
        {issues.length > 6 && (
          <p className="text-center text-12 text-red-600">+{issues.length - 6} outros chamados urgentes</p>
        )}
      </div>
    </div>
  );
}
