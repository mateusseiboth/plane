/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Inbox, AlertCircle } from "lucide-react";
import { Intake } from "@plane/propel/icons";
import { cn, calculateTimeAgo } from "@plane/utils";
import { PageHead } from "@/components/core/page-title";
import { InboxIssueRoot } from "@/components/inbox";
import { IntakeListPrintDocument, PrintButton } from "@/components/print";
import { useProject } from "@/hooks/store/use-project";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { APIService } from "@/services/api.service";
import { API_BASE_URL } from "@plane/constants";

const INTAKE_STATUS_LABEL: Record<number, string> = {
  [-2]: "Pendente",
  [-1]: "Recusado",
  0: "Adiado",
  1: "Aceito",
  2: "Duplicado",
};

const INTAKE_STATUS_COLOR: Record<number, string> = {
  [-2]: "bg-yellow-100 text-yellow-800",
  [-1]: "bg-red-100 text-red-800",
  0: "bg-gray-100 text-gray-700",
  1: "bg-green-100 text-green-800",
  2: "bg-blue-100 text-blue-800",
};

class GlobalIntakeService extends APIService {
  constructor() { super(API_BASE_URL); }
  list(slug: string, statusFilter: number[]) {
    return this.get(`/api/workspaces/${slug}/global-intake-issues/`, {
      params: {status: statusFilter.join(","), per_page: 100, cursor: "100:0:0"},
    }).then((r) => r?.data?.results ?? []).catch(() => []);
  }
}

const globalIntakeService = new GlobalIntakeService();

function GlobalIntakePage() {
  const { workspaceSlug } = useParams();
  const searchParams = useSearchParams();
  const selectedProjectId = searchParams.get("projectId");
  const inboxIssueId = searchParams.get("inboxIssueId") ?? undefined;

  const { joinedProjectIds, getProjectById } = useProject();
  const { currentWorkspace } = useWorkspace();

  const intakeProjects = (joinedProjectIds ?? [])
    .map((id) => getProjectById(id))
    .filter((p) => !!p);

  const activeProject = selectedProjectId
    ? intakeProjects.find((p) => p?.id === selectedProjectId)
    : undefined;

  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - Solicitações globais` : "Solicitações globais";

  // ── Global list state (when no project is selected) ──────────────────────
  const [statusFilter, setStatusFilter] = useState<number>(-2); // -2=pending default
  const [allIntakes, setAllIntakes] = useState<any[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);

  useEffect(() => {
    if (activeProject || !workspaceSlug) return;
    setLoadingAll(true);
    globalIntakeService.list(workspaceSlug.toString(), [statusFilter])
      .then(setAllIntakes)
      .finally(() => setLoadingAll(false));
  }, [workspaceSlug, activeProject, statusFilter]);

  return (
    <div className="flex h-full w-full overflow-hidden">
      <PageHead title={pageTitle} />

      {/* Project selector sidebar */}
      <div className="flex h-full w-56 flex-shrink-0 flex-col border-r border-subtle">
        <div className="flex items-center gap-2 border-b border-subtle px-4 py-3">
          <Intake className="size-4 text-secondary" />
          <span className="text-13 font-semibold">Projetos</span>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {/* "All" option */}
          <Link
            href={`/${workspaceSlug}/global-intake/`}
            className={cn(
              "flex w-full items-center gap-2 px-4 py-2 text-left text-13 hover:bg-surface-2 transition-colors",
              !activeProject && "bg-surface-1-80 font-medium"
            )}
          >
            <Inbox className="size-3.5 text-secondary" />
            <span>Todos os projetos</span>
          </Link>
          {intakeProjects.length === 0 && (
            <p className="px-4 py-3 text-xs text-secondary">Nenhum projeto encontrado.</p>
          )}
          {intakeProjects.map((project) => {
            if (!project) return null;
            const isActive = activeProject?.id === project.id;
            return (
              <Link
                key={project.id}
                href={`/${workspaceSlug}/global-intake/?projectId=${project.id}`}
                className={cn(
                  "flex w-full items-center gap-2 px-4 py-2 text-left text-13 hover:bg-surface-2 transition-colors",
                  isActive && "bg-surface-1-80 font-medium"
                )}
              >
                {project.emoji ? (
                  <span className="text-base leading-none">{String.fromCodePoint(parseInt(project.emoji, 10))}</span>
                ) : (
                  <Intake className="size-3.5 text-secondary" />
                )}
                <span className="truncate">{project.name}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Intake content */}
      <div className="h-full flex-1 overflow-hidden">
        {activeProject ? (
          <InboxIssueRoot
            workspaceSlug={workspaceSlug.toString()}
            projectId={activeProject.id}
            inboxIssueId={inboxIssueId}
            inboxAccessible={true}
          />
        ) : (
          <div className="flex h-full flex-col overflow-hidden">
            {/* Status filter tabs */}
            <div className="flex items-center gap-1 border-b border-subtle px-6 py-3">
              {[-2, -1, 0, 1, 2].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "rounded-full px-3 py-1 text-12 font-medium transition-colors",
                    statusFilter === s
                      ? "bg-accent-primary text-white"
                      : "bg-surface-2 text-secondary hover:text-primary"
                  )}
                >
                  {INTAKE_STATUS_LABEL[s]}
                </button>
              ))}
              <div className="ml-auto">
                <PrintButton
                  documentTitle="Solicitações"
                  auditEntity="intake"
                  auditEntityId={currentWorkspace?.id ?? ""}
                  auditMetadata={{escopo: "listagem"}}
                />
              </div>
            </div>

            <IntakeListPrintDocument
              title="Solicitações"
              subtitle={currentWorkspace?.name}
              statusLabel={INTAKE_STATUS_LABEL[statusFilter]}
              records={allIntakes}
            />

            <div className="flex-1 overflow-y-auto">
              {loadingAll && (
                <div className="flex h-full items-center justify-center text-13 text-secondary">Carregando...</div>
              )}
              {!loadingAll && allIntakes.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-secondary">
                  <AlertCircle className="h-10 w-10 opacity-40" />
                  <p className="text-sm">Nenhuma solicitação com status "{INTAKE_STATUS_LABEL[statusFilter]}".</p>
                </div>
              )}
              {!loadingAll && allIntakes.map((intake: any) => (
                <Link
                  key={intake.id}
                  href={`/${workspaceSlug}/global-intake/?projectId=${intake.project?.id}&inboxIssueId=${intake.issue?.id}`}
                  className="flex items-center gap-3 border-b border-subtle px-6 py-3 hover:bg-surface-2 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-10 font-medium", INTAKE_STATUS_COLOR[intake.status] ?? "bg-surface-2 text-secondary")}>
                        {INTAKE_STATUS_LABEL[intake.status] ?? "?"}
                      </span>
                      {intake.project && (
                        <span className="text-11 text-tertiary shrink-0">{intake.project.identifier}</span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-13">{intake.issue?.name ?? "Sem título"}</p>
                  </div>
                  <span className="shrink-0 text-11 text-tertiary">{calculateTimeAgo(intake.created_at)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default observer(GlobalIntakePage);
