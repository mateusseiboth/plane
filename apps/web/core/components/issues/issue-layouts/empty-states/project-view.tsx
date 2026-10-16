/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// components
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { EIssuesStoreType } from "@plane/types";
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";

export const ProjectViewEmptyState = observer(function ProjectViewEmptyState() {
  // router
  const { workspaceSlug, projectId } = useParams();
  // store hooks
  const { toggleCreateIssueModal } = useCommandPalette();
  const { canInProject } = useMyWorkspaceActions(workspaceSlug?.toString());

  // auth
  const isCreatingIssueAllowed = canInProject("issue.create", projectId?.toString());

  return (
    // TODO: Add translation
    <EmptyStateDetailed
      assetKey="work-item"
      title="Os chamados da visualização aparecerão aqui"
      description="Os chamados ajudam você a acompanhar partes individuais do trabalho. Com eles, acompanhe o que está acontecendo, quem está trabalhando e o que já foi concluído."
      actions={[
        {
          label: "Novo chamado",
          onClick: () => {
            toggleCreateIssueModal(true, EIssuesStoreType.PROJECT_VIEW);
          },
          disabled: !isCreatingIssueAllowed,
          variant: "primary",
        },
      ]}
    />
  );
});
