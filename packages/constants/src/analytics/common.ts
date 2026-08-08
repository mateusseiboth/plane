/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TAnalyticsTabsBase } from "@plane/types";
import { ChartXAxisProperty, ChartYAxisMetric } from "@plane/types";

export interface IInsightField {
  key: string;
  i18nKey: string;
  i18nProps?: {
    entity?: string;
    entityPlural?: string;
    prefix?: string;
    suffix?: string;
    [key: string]: unknown;
  };
}

export const ANALYTICS_INSIGHTS_FIELDS: Record<TAnalyticsTabsBase, IInsightField[]> = {
  overview: [
    {
      key: "total_users",
      i18nKey: "workspace_analytics.total",
      i18nProps: {
        entity: "common.users",
      },
    },
    {
      key: "total_admins",
      i18nKey: "workspace_analytics.total",
      i18nProps: {
        entity: "common.admins",
      },
    },
    {
      key: "total_members",
      i18nKey: "workspace_analytics.total",
      i18nProps: {
        entity: "common.members",
      },
    },
    {
      key: "total_guests",
      i18nKey: "workspace_analytics.total",
      i18nProps: {
        entity: "common.guests",
      },
    },
    {
      key: "total_projects",
      i18nKey: "workspace_analytics.total",
      i18nProps: {
        entity: "common.projects",
      },
    },
    {
      key: "total_work_items",
      i18nKey: "workspace_analytics.total",
      i18nProps: {
        entity: "common.work_items",
      },
    },
    {
      key: "total_cycles",
      i18nKey: "workspace_analytics.total",
      i18nProps: {
        entity: "common.cycles",
      },
    },
    {
      key: "total_intake",
      i18nKey: "workspace_analytics.total",
      i18nProps: {
        entity: "sidebar.intake",
      },
    },
  ],
  "work-items": [
    {
      key: "total_work_items",
      i18nKey: "workspace_analytics.total",
    },
    {
      key: "started_work_items",
      i18nKey: "workspace_analytics.started_work_items",
    },
    {
      key: "backlog_work_items",
      i18nKey: "workspace_analytics.backlog_work_items",
    },
    {
      key: "un_started_work_items",
      i18nKey: "workspace_analytics.un_started_work_items",
    },
    {
      key: "completed_work_items",
      i18nKey: "workspace_analytics.completed_work_items",
    },
  ],
};

export const ANALYTICS_DURATION_FILTER_OPTIONS = [
  {
    name: "Ontem",
    value: "yesterday",
  },
  {
    name: "Últimos 7 dias",
    value: "last_7_days",
  },
  {
    name: "Últimos 30 dias",
    value: "last_30_days",
  },
  {
    name: "Últimos 3 meses",
    value: "last_3_months",
  },
];

export const ANALYTICS_X_AXIS_VALUES: { value: ChartXAxisProperty; label: string }[] = [
  {
    value: ChartXAxisProperty.STATES,
    label: "Etapa",
  },
  {
    value: ChartXAxisProperty.STATE_GROUPS,
    label: "Grupo de etapa",
  },
  {
    value: ChartXAxisProperty.PRIORITY,
    label: "Prioridade",
  },
  {
    value: ChartXAxisProperty.LABELS,
    label: "Etiqueta",
  },
  {
    value: ChartXAxisProperty.ASSIGNEES,
    label: "Responsável",
  },
  {
    value: ChartXAxisProperty.ESTIMATE_POINTS,
    label: "Ponto de estimativa",
  },
  {
    value: ChartXAxisProperty.CYCLES,
    label: "Ciclo",
  },
  {
    value: ChartXAxisProperty.MODULES,
    label: "Módulo",
  },
  {
    value: ChartXAxisProperty.COMPLETED_AT,
    label: "Data de conclusão",
  },
  {
    value: ChartXAxisProperty.TARGET_DATE,
    label: "Data de entrega",
  },
  {
    value: ChartXAxisProperty.START_DATE,
    label: "Data de início",
  },
  {
    value: ChartXAxisProperty.CREATED_AT,
    label: "Data de criação",
  },
];

export const ANALYTICS_Y_AXIS_VALUES: { value: ChartYAxisMetric; label: string }[] = [
  {
    value: ChartYAxisMetric.WORK_ITEM_COUNT,
    label: "Chamado",
  },
  {
    value: ChartYAxisMetric.ESTIMATE_POINT_COUNT,
    label: "Estimativa",
  },
  {
    value: ChartYAxisMetric.EPIC_WORK_ITEM_COUNT,
    label: "Épica",
  },
];

export const ANALYTICS_V2_DATE_KEYS = ["completed_at", "target_date", "start_date", "created_at"];
