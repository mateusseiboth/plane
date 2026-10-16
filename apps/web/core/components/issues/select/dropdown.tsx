/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import type { IIssueLabel } from "@plane/types";
// hooks
import { useLabel } from "@/hooks/store/use-label";
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";
// local imports
import type { TWorkItemLabelSelectBaseProps } from "./base";
import { WorkItemLabelSelectBase } from "./base";

type TWorkItemLabelSelectProps = Omit<TWorkItemLabelSelectBaseProps, "labelIds" | "getLabelById" | "onDropdownOpen"> & {
  projectId: string | undefined;
};

export const IssueLabelSelect = observer(function IssueLabelSelect(props: TWorkItemLabelSelectProps) {
  const { projectId } = props;
  // router
  const { workspaceSlug } = useParams();
  // store hooks
  const { canInProject } = useMyWorkspaceActions(workspaceSlug?.toString());
  const { getProjectLabelIds, getLabelById, fetchProjectLabels, createLabel } = useLabel();
  // derived values
  const projectLabelIds = getProjectLabelIds(projectId);

  // Criar etiqueta direto no seletor: label.manage no sistema do chamado.
  const canCreateLabel = !!projectId && canInProject("label.manage", projectId);

  const onDropdownOpen = () => {
    if (projectLabelIds === undefined && workspaceSlug && projectId)
      fetchProjectLabels(workspaceSlug.toString(), projectId);
  };

  const handleCreateLabel = (data: Partial<IIssueLabel>) => {
    if (!workspaceSlug || !projectId) {
      throw new Error("Workspace slug or project ID is missing");
    }
    return createLabel(workspaceSlug.toString(), projectId, data);
  };

  return (
    <WorkItemLabelSelectBase
      {...props}
      getLabelById={getLabelById}
      labelIds={projectLabelIds ?? []}
      onDropdownOpen={onDropdownOpen}
      createLabel={handleCreateLabel}
      createLabelEnabled={!!canCreateLabel}
    />
  );
});
