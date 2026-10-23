/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import Link from "next/link";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { readNomeDoAutor } from "@/components/issues/issue-detail/issue-activity/detalhe-da-atividade";

type TIssueUser = {
  activityId: string;
  customUserName?: string;
};

export function IssueCreatorDisplay(props: TIssueUser) {
  const { activityId, customUserName } = props;
  // hooks
  const {
    activity: { getActivityById },
  } = useIssueDetail();

  const activity = getActivityById(activityId);

  if (!activity) return <></>;

  return (
    <>
      {customUserName ? (
        <span className="font-medium text-primary">{customUserName || "Avião"}</span>
      ) : (
        <Link
          href={`/${activity?.workspace_detail?.slug}/profile/${activity?.actor_detail?.id}`}
          className="font-medium text-primary hover:underline"
        >
          {readNomeDoAutor(activity.actor_detail)}
        </Link>
      )}
    </>
  );
}
