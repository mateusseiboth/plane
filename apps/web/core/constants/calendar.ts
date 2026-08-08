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
    shortTitle: "jan",
    title: "Janeiro",
  },
  2: {
    shortTitle: "fev",
    title: "Fevereiro",
  },
  3: {
    shortTitle: "mar",
    title: "Março",
  },
  4: {
    shortTitle: "abr",
    title: "Abril",
  },
  5: {
    shortTitle: "mai",
    title: "Maio",
  },
  6: {
    shortTitle: "jun",
    title: "Junho",
  },
  7: {
    shortTitle: "jul",
    title: "Julho",
  },
  8: {
    shortTitle: "ago",
    title: "Agosto",
  },
  9: {
    shortTitle: "set",
    title: "Setembro",
  },
  10: {
    shortTitle: "out",
    title: "Outubro",
  },
  11: {
    shortTitle: "nov",
    title: "Novembro",
  },
  12: {
    shortTitle: "dez",
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
    shortTitle: "dom",
    title: "Domingo",
    value: EStartOfTheWeek.SUNDAY,
  },
  2: {
    shortTitle: "seg",
    title: "Segunda-feira",
    value: EStartOfTheWeek.MONDAY,
  },
  3: {
    shortTitle: "ter",
    title: "Terça-feira",
    value: EStartOfTheWeek.TUESDAY,
  },
  4: {
    shortTitle: "qua",
    title: "Quarta-feira",
    value: EStartOfTheWeek.WEDNESDAY,
  },
  5: {
    shortTitle: "qui",
    title: "Quinta-feira",
    value: EStartOfTheWeek.THURSDAY,
  },
  6: {
    shortTitle: "sex",
    title: "Sexta-feira",
    value: EStartOfTheWeek.FRIDAY,
  },
  7: {
    shortTitle: "sáb",
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
