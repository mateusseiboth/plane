/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueActivity } from "@plane/types";

export const getRelationActivityContent = (activity: TIssueActivity | undefined): string | undefined => {
  if (!activity) return;

  switch (activity.field) {
    case "blocking":
      return activity.old_value === ""
        ? `marcou que este chamado está bloqueando o chamado `
        : `removeu o chamado bloqueado `;
    case "blocked_by":
      return activity.old_value === ""
        ? `marcou que este chamado está bloqueado por `
        : `removeu o bloqueio deste chamado pelo chamado `;
    case "duplicate":
      return activity.old_value === ""
        ? `marcou este chamado como duplicado de `
        : `removeu este chamado como duplicado de `;
    case "relates_to":
      return activity.old_value === "" ? `marcou que este chamado se relaciona com ` : `removeu a relação com `;
  }

  return;
};
