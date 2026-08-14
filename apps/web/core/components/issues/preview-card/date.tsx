/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { CalendarDays } from "lucide-react";
// plane imports
import { DueDatePropertyIcon, StartDatePropertyIcon } from "@plane/propel/icons";
import type { TStateGroups } from "@plane/types";
import { cn, hasSignificantTime, renderFormattedDate, renderFormattedDateTime, shouldHighlightIssueDueDate } from "@plane/utils";

type Props = {
  startDate: string | null;
  stateGroup: TStateGroups;
  targetDate: string | null;
};

export function WorkItemPreviewCardDate(props: Props) {
  const { startDate, stateGroup, targetDate } = props;
  // derived values
  // Com hora marcada o intervalo "início - prazo" esconderia justamente a hora,
  // então o prazo passa a aparecer sozinho.
  const isDateRangeEnabled = Boolean(startDate && targetDate) && !hasSignificantTime(targetDate);
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
            {renderFormattedDate(startDate)} - {renderFormattedDate(targetDate)}
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
