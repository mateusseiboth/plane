/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
// helpers
import { formatDateRange, getDateTime } from "@plane/utils";

type Props = {
  startDate: Date | string | null | undefined;
  endDate: Date | string | null | undefined;
  className?: string;
};

/**
 * Formats merged date range display with smart formatting
 * - Single date: "24 jan 2025"
 * - Same year, same month: "24 - 28 jan 2025"
 * - Same year, different month: "24 jan - 06 fev 2025"
 * - Different year: "28 dez 2024 - 04 jan 2025"
 * - Fim com hora marcada: "24 - 28 jan 2025 · 14:00"
 */
export const MergedDateDisplay = observer(function MergedDateDisplay(props: Props) {
  const { startDate, endDate, className = "" } = props;

  // `getDateTime`, e não `getDate`: este último corta a string em 10 caracteres,
  // o que além de jogar a hora fora erra o dia quando o prazo é um instante UTC
  // (30/09 23:59 em UTC-3 chega como "2026-10-01T02:59:00Z" e virava 1º/10).
  // Valores só-data — os de ciclos e módulos — caem no mesmo caminho de antes.
  const parsedStartDate = getDateTime(startDate);
  const parsedEndDate = getDateTime(endDate);

  const displayText = formatDateRange(parsedStartDate, parsedEndDate);

  if (!displayText) {
    return null;
  }

  return <span className={className}>{displayText}</span>;
});
