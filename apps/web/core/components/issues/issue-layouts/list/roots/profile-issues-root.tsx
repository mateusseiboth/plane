/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import {observer} from "mobx-react";
import {useParams} from "next/navigation";
// hooks
import {useMyWorkspaceActions} from "@/hooks/use-workflow-role";
import {isIssueEditAllowed} from "@/lib/permissoes/regras-de-chamado";
// local imports
import {ProjectIssueQuickActions} from "../../quick-action-dropdowns";
import {BaseListRoot} from "../base-list-root";

export const ProfileIssuesListLayout = observer(function ProfileIssuesListLayout() {
  // router
  const {workspaceSlug, profileViewId} = useParams();
  // store
  const {canInProject} = useMyWorkspaceActions(workspaceSlug?.toString());

  const canEditPropertiesBasedOnProject = (projectId: string) =>
    isIssueEditAllowed((action) => canInProject(action, projectId));

  return (
    <BaseListRoot
      QuickActions={ProjectIssueQuickActions}
      canEditPropertiesBasedOnProject={canEditPropertiesBasedOnProject}
      viewId={profileViewId?.toString()}
    />
  );
});
