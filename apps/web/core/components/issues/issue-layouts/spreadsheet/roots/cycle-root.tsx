/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// hooks
import { useCycle } from "@/hooks/store/use-cycle";
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";
import { isIssueEditAllowed } from "@/lib/permissoes/regras-de-chamado";
// components
import { CycleIssueQuickActions } from "../../quick-action-dropdowns";
import { BaseSpreadsheetRoot } from "../base-spreadsheet-root";

export const CycleSpreadsheetLayout = observer(function CycleSpreadsheetLayout() {
  // router
  const { workspaceSlug, projectId, cycleId } = useParams();
  // store hooks
  const { currentProjectCompletedCycleIds } = useCycle();
  const { canInProject } = useMyWorkspaceActions(workspaceSlug?.toString());
  // auth
  const isCompletedCycle =
    cycleId && currentProjectCompletedCycleIds ? currentProjectCompletedCycleIds.includes(cycleId.toString()) : false;
  const isEditingAllowed = isIssueEditAllowed((action) => canInProject(action, projectId?.toString()));

  const canEditIssueProperties = useCallback(
    () => !isCompletedCycle && isEditingAllowed,
    [isCompletedCycle, isEditingAllowed]
  );

  if (!cycleId) return null;

  return (
    <BaseSpreadsheetRoot
      QuickActions={CycleIssueQuickActions}
      canEditPropertiesBasedOnProject={canEditIssueProperties}
      isCompletedCycle={isCompletedCycle}
      viewId={cycleId.toString()}
    />
  );
});
