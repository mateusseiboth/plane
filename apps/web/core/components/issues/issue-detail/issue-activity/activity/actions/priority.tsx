/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { PriorityPropertyIcon } from "@plane/propel/icons";
import { useTranslation } from "@plane/i18n";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// components
import { IssueActivityBlockComponent, IssueLink } from "./";

type TIssuePriorityActivity = { activityId: string; showIssue?: boolean; ends: "top" | "bottom" | undefined };

const PRIORITY_I18N: Record<string, string> = {
  urgent: "issue.priority.urgent",
  high: "issue.priority.high",
  medium: "issue.priority.medium",
  low: "issue.priority.low",
  none: "common.none",
};

export const IssuePriorityActivity = observer(function IssuePriorityActivity(props: TIssuePriorityActivity) {
  const { activityId, showIssue = true, ends } = props;
  const { t } = useTranslation();
  // hooks
  const {
    activity: { getActivityById },
  } = useIssueDetail();

  const activity = getActivityById(activityId);

  if (!activity) return <></>;
  const value = activity.new_value ?? "";
  const translatedValue = PRIORITY_I18N[value] ? t(PRIORITY_I18N[value]) : value;
  return (
    <IssueActivityBlockComponent
      icon={<PriorityPropertyIcon className="h-3.5 w-3.5 text-secondary" aria-hidden="true" />}
      activityId={activityId}
      ends={ends}
    >
      <>
        {t("activity.set_priority_to")} <span className="font-medium text-primary">{translatedValue}</span>
        {showIssue ? ` ${t("activity.for")} ` : ``}
        {showIssue && <IssueLink activityId={activityId} />}.
      </>
    </IssueActivityBlockComponent>
  );
});
