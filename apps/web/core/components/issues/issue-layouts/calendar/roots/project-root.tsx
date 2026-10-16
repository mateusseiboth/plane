/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
// hooks
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";
import { isIssueEditAllowed } from "@/lib/permissoes/regras-de-chamado";
// local imports
import { ProjectIssueQuickActions } from "../../quick-action-dropdowns";
import { BaseCalendarRoot } from "../base-calendar-root";

export const CalendarLayout = observer(function CalendarLayout() {
  // router
  const { workspaceSlug } = useParams();
  // hooks
  const { canInProject } = useMyWorkspaceActions(workspaceSlug?.toString());
  // derived values
  const canEditPropertiesBasedOnProject = (projectId: string) =>
    isIssueEditAllowed((action) => canInProject(action, projectId));

  return (
    <BaseCalendarRoot
      QuickActions={ProjectIssueQuickActions}
      canEditPropertiesBasedOnProject={canEditPropertiesBasedOnProject}
    />
  );
});
