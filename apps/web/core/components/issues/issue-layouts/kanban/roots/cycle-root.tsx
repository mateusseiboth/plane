/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// components
import { EIssuesStoreType } from "@plane/types";
// hooks
import { useCycle } from "@/hooks/store/use-cycle";
import { useIssues } from "@/hooks/store/use-issues";
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";
import { isIssueEditAllowed } from "@/lib/permissoes/regras-de-chamado";
// local imports
import { CycleIssueQuickActions } from "../../quick-action-dropdowns";
import { BaseKanBanRoot } from "../base-kanban-root";

export const CycleKanBanLayout = observer(function CycleKanBanLayout() {
  const { workspaceSlug, projectId, cycleId } = useParams();

  // store
  const { issues } = useIssues(EIssuesStoreType.CYCLE);
  const { currentProjectCompletedCycleIds } = useCycle();
  const { canInProject } = useMyWorkspaceActions(workspaceSlug?.toString());

  const isCompletedCycle =
    cycleId && currentProjectCompletedCycleIds ? currentProjectCompletedCycleIds.includes(cycleId.toString()) : false;
  const isEditingAllowed = isIssueEditAllowed((action) => canInProject(action, projectId?.toString()));

  const canEditIssueProperties = useCallback(
    () => !isCompletedCycle && isEditingAllowed,
    [isCompletedCycle, isEditingAllowed]
  );

  const addIssuesToView = useCallback(
    (issueIds: string[]) => {
      if (!workspaceSlug || !projectId || !cycleId) throw new Error();
      return issues.addIssueToCycle(workspaceSlug.toString(), projectId.toString(), cycleId.toString(), issueIds);
    },
    [issues?.addIssueToCycle, workspaceSlug, projectId, cycleId]
  );

  return (
    <BaseKanBanRoot
      QuickActions={CycleIssueQuickActions}
      addIssuesToView={addIssuesToView}
      canEditPropertiesBasedOnProject={canEditIssueProperties}
      isCompletedCycle={isCompletedCycle}
      viewId={cycleId?.toString()}
    />
  );
});
