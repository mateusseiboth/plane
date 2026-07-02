/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TCalendarLayouts } from "@plane/types";
import { EStartOfTheWeek } from "@plane/types";

export const MONTHS_LIST: {
  [monthNumber: number]: {
    shortTitle: string;
    title: string;
  };
} = {
  1: {
    shortTitle: "Jan",
    title: "Janeiro",
  },
  2: {
    shortTitle: "Feb",
    title: "Fevereiro",
  },
  3: {
    shortTitle: "Mar",
    title: "Março",
  },
  4: {
    shortTitle: "Apr",
    title: "Abril",
  },
  5: {
    shortTitle: "May",
    title: "May",
  },
  6: {
    shortTitle: "Jun",
    title: "Junho",
  },
  7: {
    shortTitle: "Jul",
    title: "Julho",
  },
  8: {
    shortTitle: "Aug",
    title: "Agosto",
  },
  9: {
    shortTitle: "Sep",
    title: "Setembro",
  },
  10: {
    shortTitle: "Oct",
    title: "Outubro",
  },
  11: {
    shortTitle: "Nov",
    title: "Novembro",
  },
  12: {
    shortTitle: "Dec",
    title: "Dezembro",
  },
};

export const DAYS_LIST: {
  [dayIndex: number]: {
    shortTitle: string;
    title: string;
    value: EStartOfTheWeek;
  };
} = {
  1: {
    shortTitle: "Sun",
    title: "Domingo",
    value: EStartOfTheWeek.SUNDAY,
  },
  2: {
    shortTitle: "Mon",
    title: "Segunda-feira",
    value: EStartOfTheWeek.MONDAY,
  },
  3: {
    shortTitle: "Tue",
    title: "Terça-feira",
    value: EStartOfTheWeek.TUESDAY,
  },
  4: {
    shortTitle: "Wed",
    title: "Quarta-feira",
    value: EStartOfTheWeek.WEDNESDAY,
  },
  5: {
    shortTitle: "Thu",
    title: "Quinta-feira",
    value: EStartOfTheWeek.THURSDAY,
  },
  6: {
    shortTitle: "Fri",
    title: "Sexta-feira",
    value: EStartOfTheWeek.FRIDAY,
  },
  7: {
    shortTitle: "Sat",
    title: "Sábado",
    value: EStartOfTheWeek.SATURDAY,
  },
};

export const CALENDAR_LAYOUTS: {
  [layout in TCalendarLayouts]: {
    key: TCalendarLayouts;
    title: string;
  };
} = {
  month: {
    key: "month",
    title: "Layout de mês",
  },
  week: {
    key: "week",
    title: "Layout de semana",
  },
};
