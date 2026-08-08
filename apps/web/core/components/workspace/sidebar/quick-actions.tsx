/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { EProjectAction, EUserPermissions, EUserPermissionsLevel, PROJECT_WORK_ROLES, SIDEBAR_TRACKER_ELEMENTS, canPerform } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { AddWorkItemIcon } from "@plane/propel/icons";
import type { TIssue } from "@plane/types";
// components
import { IntakeQuickCreate } from "@/components/inbox/modals/intake-quick-create";
import { CreateUpdateIssueModal } from "@/components/issues/issue-modal/modal";
import { SidebarAddButton } from "@/components/sidebar/add-button";
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import useLocalStorage from "@/hooks/use-local-storage";

export const SidebarQuickActions = observer(function SidebarQuickActions() {
  const { t } = useTranslation();
  // states
  const [isDraftIssueModalOpen, setIsDraftIssueModalOpen] = useState(false);
  const [_isDraftButtonOpen, setIsDraftButtonOpen] = useState(false);
  const [isIntakeCreateOpen, setIsIntakeCreateOpen] = useState(false);
  // refs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const timeoutRef = useRef<any>();
  // router
  const { workspaceSlug: routerWorkspaceSlug } = useParams();
  const workspaceSlug = routerWorkspaceSlug?.toString();
  // store hooks
  const { toggleCreateIssueModal } = useCommandPalette();
  const { joinedProjectIds } = useProject();
  const { allowPermissions, getProjectRolesByWorkspaceSlug } = useUserPermissions();
  // local storage
  const { storedValue, setValue } = useLocalStorage<Record<string, Partial<TIssue>>>("draftedIssue", {});
  // derived values
  const canCreateIssue = allowPermissions(
    PROJECT_WORK_ROLES,
    EUserPermissionsLevel.WORKSPACE
  );

  // D2 — quem só opera a mesa de atendimento abre SOLICITAÇÃO, não chamado.
  // A decisão sai da capacidade (INTAKE_CREATE sem ISSUE_CREATE), não de comparar
  // o papel com o número 6: papéis customizados também podem ter esse perfil, e o
  // número deixaria todos eles de fora.
  const projectRoles = workspaceSlug ? getProjectRolesByWorkspaceSlug(workspaceSlug) : {};
  const intakeProjectIds = Object.entries(projectRoles ?? {})
    .filter(([, role]) => {
      const level = Number(role);
      return canPerform(level, EProjectAction.INTAKE_CREATE) && !canPerform(level, EProjectAction.ISSUE_CREATE);
    })
    .map(([projectId]) => projectId);
  const isAtendimento = !canCreateIssue && intakeProjectIds.length > 0;

  const disabled = joinedProjectIds.length === 0 || (!canCreateIssue && !isAtendimento);

  const handleCreateClick = () => {
    if (isAtendimento) setIsIntakeCreateOpen(true);
    else toggleCreateIssueModal(true);
  };
  const workspaceDraftIssue = workspaceSlug ? (storedValue?.[workspaceSlug] ?? undefined) : undefined;

  const handleMouseEnter = () => {
    // if enter before time out clear the timeout
    if (timeoutRef?.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsDraftButtonOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsDraftButtonOpen(false);
    }, 300);
  };

  const removeWorkspaceDraftIssue = () => {
    const draftIssues = storedValue ?? {};
    if (workspaceSlug && draftIssues[workspaceSlug]) delete draftIssues[workspaceSlug];
    setValue(draftIssues);
    return Promise.resolve();
  };

  return (
    <>
      <CreateUpdateIssueModal
        isOpen={isDraftIssueModalOpen}
        onClose={() => setIsDraftIssueModalOpen(false)}
        data={workspaceDraftIssue ?? {}}
        onSubmit={() => removeWorkspaceDraftIssue()}
        fetchIssueDetails={false}
        isDraft
      />
      {workspaceSlug && (
        <IntakeQuickCreate
          workspaceSlug={workspaceSlug}
          projectIds={intakeProjectIds}
          isOpen={isIntakeCreateOpen}
          onClose={() => setIsIntakeCreateOpen(false)}
        />
      )}
      <div className="flex cursor-pointer items-center justify-between gap-2">
        <SidebarAddButton
          label={
            <>
              <AddWorkItemIcon className="size-4" />
              <span className="max-w-[145px] truncate text-13 font-medium">
                {isAtendimento ? "Nova solicitação" : t("sidebar.new_work_item")}
              </span>
            </>
          }
          onClick={handleCreateClick}
          disabled={disabled}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          data-ph-element={SIDEBAR_TRACKER_ELEMENTS.CREATE_WORK_ITEM_BUTTON}
        />
      </div>
    </>
  );
});
