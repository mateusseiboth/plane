/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// hooks
import { StatePropertyIcon } from "@plane/propel/icons";
import { useTranslation } from "@plane/i18n";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// components
import { IssueActivityBlockComponent, IssueLink } from "./";
// icons

type TIssueStateActivity = { activityId: string; showIssue?: boolean; ends: "top" | "bottom" | undefined };

export const IssueStateActivity = observer(function IssueStateActivity(props: TIssueStateActivity) {
  const { activityId, showIssue = true, ends } = props;
  const { t } = useTranslation();
  // hooks
  const {
    activity: { getActivityById },
  } = useIssueDetail();

  const activity = getActivityById(activityId);

  if (!activity) return <></>;
  return (
    <IssueActivityBlockComponent
      icon={<StatePropertyIcon className="h-4 w-4 flex-shrink-0 text-secondary" />}
      activityId={activityId}
      ends={ends}
    >
      <>
        {t("activity.set_state_to")} <span className="font-medium text-primary">{activity.new_value}</span>
        {showIssue ? ` ${t("activity.for")} ` : ``}
        {showIssue && <IssueLink activityId={activityId} />}.
      </>
    </IssueActivityBlockComponent>
  );
});
