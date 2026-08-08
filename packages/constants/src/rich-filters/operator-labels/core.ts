/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TCoreSupportedOperators, TCoreSupportedDateFilterOperators } from "@plane/types";
import { CORE_EQUALITY_OPERATOR, CORE_COLLECTION_OPERATOR, CORE_COMPARISON_OPERATOR } from "@plane/types";

/**
 * Core operator labels
 */
export const CORE_OPERATOR_LABELS_MAP: Record<TCoreSupportedOperators, string> = {
  [CORE_EQUALITY_OPERATOR.EXACT]: "é",
  [CORE_COLLECTION_OPERATOR.IN]: "é um de",
  [CORE_COMPARISON_OPERATOR.RANGE]: "entre",
} as const;

/**
 * Core date-specific operator labels
 */
export const CORE_DATE_OPERATOR_LABELS_MAP: Record<TCoreSupportedDateFilterOperators, string> = {
  [CORE_EQUALITY_OPERATOR.EXACT]: "é",
  [CORE_COMPARISON_OPERATOR.RANGE]: "entre",
} as const;
