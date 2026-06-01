/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { EIssueLayoutTypes } from "@plane/types";
import type { IProjectView } from "@plane/types";
import type { TWorkspaceLayoutProps } from "@/components/views/helper";
import { LayoutSelection } from "@/components/issues/issue-layouts/filters/header/layout-selection";
import { BaseListRoot } from "@/components/issues/issue-layouts/list/base-list-root";
import { BaseKanBanRoot } from "@/components/issues/issue-layouts/kanban/base-kanban-root";
import { BaseCalendarRoot } from "@/components/issues/issue-layouts/calendar/base-calendar-root";
import { BaseGanttRoot } from "@/components/issues/issue-layouts/gantt/base-gantt-root";
import { AllIssueQuickActions } from "@/components/issues/issue-layouts/quick-action-dropdowns";

export type TLayoutSelectionProps = {
  onChange: (layout: EIssueLayoutTypes) => void;
  selectedLayout: EIssueLayoutTypes;
  workspaceSlug: string;
};

// Layouts offered on the global "All work items" view.
const GLOBAL_VIEW_LAYOUTS: EIssueLayoutTypes[] = [
  EIssueLayoutTypes.SPREADSHEET,
  EIssueLayoutTypes.LIST,
  EIssueLayoutTypes.KANBAN,
  EIssueLayoutTypes.CALENDAR,
  EIssueLayoutTypes.GANTT,
];

export function GlobalViewLayoutSelection(props: TLayoutSelectionProps) {
  const { onChange, selectedLayout } = props;
  return <LayoutSelection layouts={GLOBAL_VIEW_LAYOUTS} onChange={onChange} selectedLayout={selectedLayout} />;
}

// Renders the non-spreadsheet layouts for the global view. The surrounding
// AllIssueLayoutRoot already provides the GLOBAL IssuesStoreContext, so the base
// roots resolve the GLOBAL store/actions automatically.
export function WorkspaceAdditionalLayouts(props: TWorkspaceLayoutProps) {
  const { activeLayout, globalViewId } = props;
  switch (activeLayout) {
    case EIssueLayoutTypes.LIST:
      return <BaseListRoot QuickActions={AllIssueQuickActions} viewId={globalViewId} />;
    case EIssueLayoutTypes.KANBAN:
      return <BaseKanBanRoot QuickActions={AllIssueQuickActions} viewId={globalViewId} />;
    case EIssueLayoutTypes.CALENDAR:
      return <BaseCalendarRoot QuickActions={AllIssueQuickActions} viewId={globalViewId} />;
    case EIssueLayoutTypes.GANTT:
      return <BaseGanttRoot viewId={globalViewId} />;
    default:
      return <></>;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function AdditionalHeaderItems(view: IProjectView) {
  return <></>;
}
