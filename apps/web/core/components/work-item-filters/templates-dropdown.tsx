/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Check, LayoutTemplate } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { IWorkItemFilterInstance } from "@plane/shared-state";
import { CustomMenu, Tooltip } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useWorkItemFilterTemplates } from "@/hooks/work-item-filters/use-work-item-filter-templates";

type TWorkItemFilterTemplatesDropdownProps = {
  filter: IWorkItemFilterInstance | undefined;
};

const BUTTON_CLASSNAME =
  "flex h-7 items-center gap-1 rounded-md border border-subtle-1 px-2 py-0.5 text-12 text-secondary transition-all duration-200 cursor-pointer";

const ACTIVE_BUTTON_CLASSNAME =
  "border-accent-subtle-1 bg-accent-subtle text-accent-primary hover:bg-accent-subtle-hover";

/**
 * Sector filter templates. Lives next to the filters toggle, so every work item layout
 * (kanban, list, spreadsheet, calendar, gantt) gets it from a single place.
 */
export const WorkItemFilterTemplatesDropdown = observer(function WorkItemFilterTemplatesDropdown(
  props: TWorkItemFilterTemplatesDropdownProps
) {
  const { filter } = props;
  // hooks
  const { t } = useTranslation();
  const { templates, activeTemplate, canClearFilters, clearFilters } = useWorkItemFilterTemplates(filter);

  if (!filter) return null;

  const customButton = (
    <Tooltip tooltipContent={t("common.filter_templates.tooltip")} position="bottom">
      <div className={cn(BUTTON_CLASSNAME, "px-1.5 @4xl:px-2", { [ACTIVE_BUTTON_CLASSNAME]: !!activeTemplate })}>
        <LayoutTemplate className="size-4 flex-shrink-0" />
        {/* Em tela estreita fica só o ícone: a barra já disputa espaço com os
            atalhos de pessoa, o layout, o menu de exibição e o botão de novo
            chamado. O modelo ativo continua sinalizado pela cor. */}
        <span className="hidden max-w-32 truncate @4xl:inline">
          {activeTemplate?.label ?? t("common.filter_templates.label")}
        </span>
      </div>
    </Tooltip>
  );

  return (
    <CustomMenu customButton={customButton} placement="bottom-end" maxHeight="lg" closeOnSelect>
      {templates.length === 0 && (
        <CustomMenu.MenuItem disabled>
          <span className="text-placeholder italic">{t("common.filter_templates.unavailable")}</span>
        </CustomMenu.MenuItem>
      )}
      {templates.map((template) => (
        <CustomMenu.MenuItem key={template.key} onClick={template.applyTemplate} className="whitespace-normal">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col">
              <span className={cn("text-secondary", { "font-medium text-accent-primary": template.isActive })}>
                {template.label}
              </span>
              <span className="text-11 text-tertiary">{template.description}</span>
            </div>
            {template.isActive && <Check className="mt-0.5 size-3.5 flex-shrink-0 text-accent-primary" />}
          </div>
        </CustomMenu.MenuItem>
      ))}
      {canClearFilters && (
        <CustomMenu.MenuItem onClick={clearFilters} className="border-t border-subtle">
          {t("common.filter_templates.clear")}
        </CustomMenu.MenuItem>
      )}
    </CustomMenu>
  );
});
