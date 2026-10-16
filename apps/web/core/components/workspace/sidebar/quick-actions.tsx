/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { SIDEBAR_TRACKER_ELEMENTS } from "@plane/constants";
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
import useLocalStorage from "@/hooks/use-local-storage";
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";
import { isIntakeOnlyOperator } from "@/lib/permissoes/regras-de-chamado";

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
  const { can } = useMyWorkspaceActions(workspaceSlug);
  // local storage
  const { storedValue, setValue } = useLocalStorage<Record<string, Partial<TIssue>>>("draftedIssue", {});
  // derived values
  const canCreateIssue = can("issue.create");

  // D2: quem só opera a mesa de atendimento (abre pedido, não cria chamado) abre
  // SOLICITAÇÃO, em qualquer sistema de que participa. A função é a mesma em todo
  // sistema, então a decisão é da matriz do espaço.
  const intakeProjectIds = isIntakeOnlyOperator(can) ? joinedProjectIds : [];
  const isAtendimento = intakeProjectIds.length > 0;

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
