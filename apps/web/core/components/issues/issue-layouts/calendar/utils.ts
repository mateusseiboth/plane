/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssue } from "@plane/types";
import { getDateTime, hasSignificantTime, renderFormattedPayloadDateTime } from "@plane/utils";

/**
 * O calendário arrasta por dia, então o destino chega como "yyyy-MM-dd". Se o
 * prazo tinha hora marcada, mudar de dia não pode zerá-la: reaproveitamos a hora
 * atual no dia novo.
 */
const buildDestinationTargetDate = (destinationDate: string, currentTargetDate: string | null | undefined) => {
  if (!hasSignificantTime(currentTargetDate)) return destinationDate;

  const currentDate = getDateTime(currentTargetDate);
  const nextDate = getDateTime(destinationDate);
  if (!currentDate || !nextDate) return destinationDate;

  nextDate.setHours(currentDate.getHours(), currentDate.getMinutes(), 0, 0);
  return renderFormattedPayloadDateTime(nextDate) ?? destinationDate;
};

export const handleDragDrop = async (
  issueId: string,
  sourceDate: string,
  destinationDate: string,
  workspaceSlug: string | undefined,
  projectId: string | undefined,
  updateIssue?: (projectId: string, issueId: string, data: Partial<TIssue>) => Promise<void>,
  currentTargetDate?: string | null
) => {
  if (!workspaceSlug || !projectId || !updateIssue) return;

  if (sourceDate === destinationDate) return;

  const updatedIssue = {
    id: issueId,
    target_date: buildDestinationTargetDate(destinationDate, currentTargetDate),
  };

  return await updateIssue(projectId, updatedIssue.id, updatedIssue);
};
