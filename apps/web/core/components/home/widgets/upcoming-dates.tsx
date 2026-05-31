"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import type { THomeWidgetProps } from "@plane/types";
import { cn } from "@plane/utils";
import { APIService } from "@/services/api.service";
import { API_BASE_URL } from "@plane/constants";

class DueDateService extends APIService {
  constructor() { super(API_BASE_URL); }
  upcoming(slug: string) {
    const today = new Date().toISOString().slice(0, 10);
    const inSevenDays = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    return this.get(`/api/workspaces/${slug}/issues/`, {
      params: { target_date: `${today};${inSevenDays}`, state_group: "backlog,unstarted,started", per_page: 10, cursor: "10:0:0" },
    }).then((r) => r?.data?.results ?? []).catch(() => []);
  }
}

const dueDateService = new DueDateService();

function daysLabel(dateStr: string) {
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(dateStr); target.setHours(0,0,0,0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return { label: "Hoje", urgent: true };
  if (diff === 1) return { label: "Amanhã", urgent: true };
  if (diff < 0) return { label: `${Math.abs(diff)}d atraso`, urgent: true };
  return { label: `${diff}d`, urgent: false };
}

export function UpcomingDatesWidget({ workspaceSlug }: THomeWidgetProps) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dueDateService.upcoming(workspaceSlug).then(setItems).finally(() => setLoading(false));
  }, [workspaceSlug]);

  if (loading) return <div className="h-32 animate-pulse rounded-xl border border-subtle bg-surface-2" />;

  return (
    <div className="rounded-xl border border-subtle bg-surface-1 p-4">
      <div className="mb-3 flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-secondary" />
        <span className="text-13 font-semibold">Prazos Próximos</span>
      </div>
      {items.length === 0 && (
        <p className="py-4 text-center text-13 text-secondary">Nenhum prazo nos próximos 7 dias.</p>
      )}
      <div className="space-y-2">
        {items.slice(0, 8).map((issue) => {
          const { label, urgent } = daysLabel(issue.target_date);
          return (
            <div key={issue.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2">
              <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-10 font-semibold", urgent ? "bg-red-100 text-red-700" : "bg-surface-2 text-secondary")}>
                {label}
              </span>
              <span className="flex-1 truncate text-13">{issue.name}</span>
              {issue.project_detail?.identifier && (
                <span className="shrink-0 text-11 text-tertiary">{issue.project_detail.identifier}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
