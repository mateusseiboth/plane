/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { CalendarDays } from "lucide-react";
// plane imports
import { DueDatePropertyIcon, StartDatePropertyIcon } from "@plane/propel/icons";
import type { TStateGroups } from "@plane/types";
import { cn, renderFormattedDate, renderFormattedDateTime, shouldHighlightIssueDueDate } from "@plane/utils";

type Props = {
  startDate: string | null;
  stateGroup: TStateGroups;
  targetDate: string | null;
};

export function WorkItemPreviewCardDate(props: Props) {
  const { startDate, stateGroup, targetDate } = props;
  // derived values
  const isDateRangeEnabled = Boolean(startDate && targetDate);
  const shouldHighlightDate = shouldHighlightIssueDueDate(targetDate, stateGroup);

  if (!startDate && !targetDate) return null;

  return (
    <div className="h-full rounded-sm px-1 text-11 text-secondary">
      {isDateRangeEnabled ? (
        <div
          className={cn("flex h-full items-center gap-1", {
            "text-danger-primary": shouldHighlightDate,
          })}
        >
          <CalendarDays className="size-3 shrink-0" />
          <span>
            {/* Só o prazo pode ter hora; sem hora marcada sai idêntico a antes. */}
            {renderFormattedDate(startDate)} - {renderFormattedDateTime(targetDate)}
          </span>
        </div>
      ) : targetDate ? (
        <div
          className={cn("flex h-full items-center gap-1", {
            "text-danger-primary": shouldHighlightDate,
          })}
        >
          <DueDatePropertyIcon className="size-3 shrink-0" />
          <span>{renderFormattedDateTime(targetDate)}</span>
        </div>
      ) : (
        <div className="flex h-full items-center gap-1">
          <StartDatePropertyIcon className="size-3 shrink-0" />
          <span>{renderFormattedDate(startDate)}</span>
        </div>
      )}
    </div>
  );
}
