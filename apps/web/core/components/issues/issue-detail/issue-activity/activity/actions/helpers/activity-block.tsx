/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { Network } from "lucide-react";
// plane imports
import { Tooltip } from "@plane/propel/tooltip";
import { calculateTimeAgo } from "@plane/utils";
import { formatDataHoraDaAtividade } from "@/components/issues/issue-detail/issue-activity/detalhe-da-atividade";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { usePlatformOS } from "@/hooks/use-platform-os";
// plane web imports
import { IssueCreatorDisplay } from "@/plane-web/components/issues/issue-details/issue-creator";
// local imports
import { IssueUser } from "../";

type TIssueActivityBlockComponent = {
  icon?: ReactNode;
  activityId: string;
  ends: "top" | "bottom" | undefined;
  children: ReactNode;
  customUserName?: string;
};

export function IssueActivityBlockComponent(props: TIssueActivityBlockComponent) {
  const { icon, activityId, ends, children, customUserName } = props;
  // hooks
  const {
    activity: { getActivityById },
  } = useIssueDetail();

  const activity = getActivityById(activityId);
  const { isMobile } = usePlatformOS();
  if (!activity) return <></>;
  return (
    <div
      className={`relative flex items-center gap-3 text-caption-sm-regular ${
        ends === "top" ? `pb-2` : ends === "bottom" ? `pt-2` : `py-2`
      }`}
    >
      <div className="absolute top-0 bottom-0 left-[13px] w-px bg-layer-3" aria-hidden />
      <div className="z-[4] flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-subtle bg-layer-2 text-secondary shadow-raised-100">
        {icon ? icon : <Network className="h-3.5 w-3.5" />}
      </div>
      <div className="w-full min-w-0 text-secondary">
        <div className="break-words">
          {!activity?.field && activity?.verb === "created" ? (
            <IssueCreatorDisplay activityId={activityId} customUserName={customUserName} />
          ) : (
            <IssueUser activityId={activityId} customUserName={customUserName} />
          )}
          <span> {children} </span>
        </div>
        {/* Data e hora absolutas sempre à vista; o "há 2 meses" fica no passar do mouse. */}
        <Tooltip isMobile={isMobile} tooltipContent={calculateTimeAgo(activity.created_at)}>
          <span className="whitespace-nowrap text-tertiary">{formatDataHoraDaAtividade(activity.created_at)}</span>
        </Tooltip>
      </div>
    </div>
  );
}
