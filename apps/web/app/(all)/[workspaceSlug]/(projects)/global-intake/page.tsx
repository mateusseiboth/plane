/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Intake } from "@plane/propel/icons";
import { cn } from "@plane/utils";
import { EInboxIssueCurrentTab } from "@plane/types";
import { PageHead } from "@/components/core/page-title";
import { InboxIssueRoot } from "@/components/inbox";
import { useProject } from "@/hooks/store/use-project";
import { useWorkspace } from "@/hooks/store/use-workspace";

function GlobalIntakePage() {
  const { workspaceSlug } = useParams();
  const searchParams = useSearchParams();
  const selectedProjectId = searchParams.get("projectId");
  const inboxIssueId = searchParams.get("inboxIssueId") ?? undefined;

  const { joinedProjectIds, getProjectById } = useProject();
  const { currentWorkspace } = useWorkspace();

  const intakeProjects = (joinedProjectIds ?? [])
    .map((id) => getProjectById(id))
    .filter((p) => p && p.inbox_view);

  const activeProject = selectedProjectId
    ? intakeProjects.find((p) => p?.id === selectedProjectId)
    : intakeProjects[0];

  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - Intake Global` : "Intake Global";

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
          {intakeProjects.length === 0 && (
            <p className="px-4 py-3 text-xs text-secondary">Nenhum projeto com intake habilitado.</p>
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
            inboxAccessible={activeProject.inbox_view ?? false}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-secondary">
              <Intake className="size-12" />
              <p className="text-sm">Selecione um projeto para ver o intake.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default observer(GlobalIntakePage);
