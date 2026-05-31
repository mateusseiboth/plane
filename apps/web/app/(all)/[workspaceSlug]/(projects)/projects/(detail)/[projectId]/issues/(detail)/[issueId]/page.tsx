/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import {useTranslation} from "@plane/i18n";
import {useTheme} from "next-themes";
import useSWR from "swr";
// assets
import emptyIssueDark from "@/app/assets/empty-state/search/issues-dark.webp?url";
import emptyIssueLight from "@/app/assets/empty-state/search/issues-light.webp?url";
// components
import {EmptyState} from "@/components/common/empty-state";
import {LogoSpinner} from "@/components/common/logo-spinner";
import {PageHead} from "@/components/core/page-title";
// hooks
import {IssueDetailRoot} from "@/components/issues/issue-detail";
import {useIssueDetail} from "@/hooks/store/use-issue-detail";
import {useProject} from "@/hooks/store/use-project";
// types
import type {Route} from "./+types/page";

export async function clientLoader({params}: Route.ClientLoaderArgs) {
  return params;
}

export default function IssueDetailsPage({params}: Route.ComponentProps) {
  const {t} = useTranslation();
  const {resolvedTheme} = useTheme();
  const {
    fetchIssue,
    issue: {getIssueById},
  } = useIssueDetail();
  const {getProjectById} = useProject();
  const {workspaceSlug, projectId, issueId} = params;

  const {isLoading} = useSWR(`ISSUE_DETAIL_${workspaceSlug}_${projectId}_${issueId}`, () => fetchIssue(workspaceSlug, projectId, issueId));

  const issue = getIssueById(issueId);
  const project = issue ? getProjectById(issue.project_id ?? "") : undefined;
  const pageTitle = project && issue ? `${project?.identifier}-${issue?.sequence_id} ${issue?.name}` : undefined;

  if (!issue && !isLoading) {
    return (
      <>
        <PageHead title={pageTitle} />
        <EmptyState
          image={resolvedTheme === "dark" ? emptyIssueDark : emptyIssueLight}
          title={t("issue.empty_state.issue_detail.title")}
          description={t("issue.empty_state.issue_detail.description")}
          primaryButton={{
            text: t("issue.empty_state.issue_detail.primary_button.text"),
            onClick: () => window.location.assign(`/${workspaceSlug}/workspace-views/all-issues/`),
          }}
        />
      </>
    );
  }

  return (
    <>
      <PageHead title={pageTitle} />
      {isLoading || !issue ? (
        <div className="flex size-full items-center justify-center">
          <LogoSpinner />
        </div>
      ) : (
        <IssueDetailRoot
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          issueId={issueId}
          is_archived={!!issue.archived_at}
        />
      )}
    </>
  );
}
