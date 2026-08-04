"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Inbox, ArrowRight } from "lucide-react";
import type { THomeWidgetProps } from "@plane/types";
import { calculateTimeAgo } from "@plane/utils";
import { APIService } from "@/services/api.service";
import { API_BASE_URL } from "@plane/constants";
import { useProject } from "@/hooks/store/use-project";

class IntakeService extends APIService {
  constructor() { super(API_BASE_URL); }
  async listOpenIntakes(slug: string, projectIds: string[]) {
    const results: any[] = [];
    await Promise.all(
      projectIds.slice(0, 5).map(async (pid) => {
        const data = await this.get(
          `/api/workspaces/${slug}/projects/${pid}/inbox-issues/`,
          { params: { status: "-2", per_page: 5, cursor: "5:0:0" } }
        ).then((r) => r?.data?.results ?? []).catch(() => []);
        data.forEach((d: any) => results.push({ ...d, _project_id: pid }));
      })
    );
    return results.sort((a, b) => new Date(b.issue?.created_at ?? 0).getTime() - new Date(a.issue?.created_at ?? 0).getTime());
  }
}

const intakeService = new IntakeService();

export function OpenIntakesWidget({ workspaceSlug }: THomeWidgetProps) {
  const [intakes, setIntakes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { joinedProjectIds } = useProject();

  useEffect(() => {
    if (!joinedProjectIds?.length) { setLoading(false); return; }
    intakeService.listOpenIntakes(workspaceSlug, joinedProjectIds)
      .then(setIntakes)
      .finally(() => setLoading(false));
  }, [workspaceSlug, joinedProjectIds]);

  if (loading) return <div className="h-32 animate-pulse rounded-xl border border-subtle bg-surface-2" />;

  return (
    <div className="rounded-xl border border-subtle bg-surface-1 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-secondary" />
          <span className="text-13 font-semibold">Solicitações abertas</span>
          {intakes.length > 0 && (
            <span className="rounded-full bg-accent-primary/15 px-1.5 py-0.5 text-10 font-semibold text-accent-primary">
              {intakes.length}
            </span>
          )}
        </div>
        <Link
          href={`/${workspaceSlug}/global-intake/`}
          className="flex items-center gap-1 text-11 text-accent-primary hover:underline"
        >
          Ver todos <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {intakes.length === 0 && (
        <p className="py-4 text-center text-13 text-secondary">Nenhuma solicitação aberta.</p>
      )}
      <div className="space-y-2">
        {intakes.slice(0, 6).map((intake) => (
          <Link
            key={intake.id}
            href={`/${workspaceSlug}/global-intake/?projectId=${intake._project_id}&inboxIssueId=${intake.issue?.id}`}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2 transition-colors"
          >
            <span className="flex-1 truncate text-13">{intake.issue?.name ?? "Sem título"}</span>
            <span className="shrink-0 text-11 text-tertiary">{calculateTimeAgo(intake.issue?.created_at)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
