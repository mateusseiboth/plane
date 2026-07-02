"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Layers, ArrowRight } from "lucide-react";
import type { THomeWidgetProps } from "@plane/types";
import { cn } from "@plane/utils";
import { APIService } from "@/services/api.service";
import { API_BASE_URL } from "@plane/constants";

class WorkItemService extends APIService {
  constructor() { super(API_BASE_URL); }
  myIssues(slug: string) {
    return this.get(`/api/workspaces/${slug}/issues/`, {
      params: { assignees: "me", state_group: "backlog,unstarted,started", per_page: 10, cursor: "10:0:0" },
    }).then((r) => r?.data?.results ?? []).catch(() => []);
  }
}

const workItemService = new WorkItemService();

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "text-red-500", high: "text-orange-500",
  medium: "text-yellow-500", low: "text-blue-500", none: "text-tertiary",
};

export function MyWorkItemsWidget({ workspaceSlug }: THomeWidgetProps) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    workItemService.myIssues(workspaceSlug).then(setItems).finally(() => setLoading(false));
  }, [workspaceSlug]);

  if (loading) return <div className="h-32 animate-pulse rounded-xl border border-subtle bg-surface-2" />;

  return (
    <div className="rounded-xl border border-subtle bg-surface-1 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-secondary" />
          <span className="text-13 font-semibold">Meus itens de trabalho</span>
        </div>
        <Link
          href={`/${workspaceSlug}/workspace-views/all-issues/`}
          className="flex items-center gap-1 text-11 text-accent-primary hover:underline"
        >
          Ver todos <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {items.length === 0 && (
        <p className="py-4 text-center text-13 text-secondary">Nenhum work item atribuído a você.</p>
      )}
      <div className="space-y-2">
        {items.slice(0, 8).map((issue) => (
          <div key={issue.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2">
            <span className={cn("text-11 font-medium", PRIORITY_COLOR[issue.priority ?? "none"])}>●</span>
            <span className="flex-1 truncate text-13">{issue.name}</span>
            {issue.state_detail?.name && (
              <span
                className="shrink-0 rounded px-1.5 py-0.5 text-10 font-medium"
                style={{ backgroundColor: (issue.state_detail.color ?? "#888") + "22", color: issue.state_detail.color }}
              >
                {issue.state_detail.name}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
