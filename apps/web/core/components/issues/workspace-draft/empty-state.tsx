/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, useState } from "react";
// components
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useTranslation } from "@plane/i18n";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { EIssuesStoreType } from "@plane/types";
import { CreateUpdateIssueModal } from "@/components/issues/issue-modal/modal";
// constants
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";

export const WorkspaceDraftEmptyState = observer(function WorkspaceDraftEmptyState() {
  // router
  const { workspaceSlug } = useParams();
  // state
  const [isDraftIssueModalOpen, setIsDraftIssueModalOpen] = useState(false);
  // store hooks
  const { t } = useTranslation();
  const { can } = useMyWorkspaceActions(workspaceSlug?.toString());
  // derived values
  const canPerformEmptyStateActions = can("issue.create");

  return (
    <Fragment>
      <CreateUpdateIssueModal
        isOpen={isDraftIssueModalOpen}
        storeType={EIssuesStoreType.WORKSPACE_DRAFT}
        onClose={() => setIsDraftIssueModalOpen(false)}
        isDraft
      />
      <div className="relative h-full w-full overflow-y-auto">
        <EmptyStateDetailed
          title={t("workspace_empty_state.drafts.title")}
          description={t("workspace_empty_state.drafts.description")}
          assetKey="draft"
          actions={[
            {
              label: t("workspace_empty_state.drafts.cta_primary"),
              onClick: () => {
                setIsDraftIssueModalOpen(true);
              },
              disabled: !canPerformEmptyStateActions,
              variant: "primary",
            },
          ]}
        />
      </div>
    </Fragment>
  );
});
