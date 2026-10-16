/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { FileText, FolderPlus, Layers, SquarePlus } from "lucide-react";
// plane imports
import { ContrastIcon, DiceIcon, LayersIcon } from "@plane/propel/icons";
// components
import type { TPowerKCommandConfig, TPowerKContext } from "@/components/power-k/core/types";
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useProject } from "@/hooks/store/use-project";
import { useUser } from "@/hooks/store/user";
import { useInstance } from "@/hooks/store/use-instance";

export type TPowerKCreationCommandKeys =
  | "create_work_item"
  | "create_page"
  | "create_view"
  | "create_cycle"
  | "create_module"
  | "create_project"
  | "create_workspace";

/**
 * Creation commands - Create any entity in the app
 */
export const usePowerKCreationCommandsRecord = (): Record<TPowerKCreationCommandKeys, TPowerKCommandConfig> => {
  // store
  const { config } = useInstance();
  const {
    permission: { canDo, canDoInProject },
  } = useUser();
  const { joinedProjectIds, getPartialProjectById } = useProject();
  const {
    toggleCreateIssueModal,
    toggleCreateProjectModal,
    toggleCreateCycleModal,
    toggleCreateModuleModal,
    toggleCreateViewModal,
    toggleCreatePageModal,
  } = useCommandPalette();
  // derived values
  // Criar chamado: a ação e participar de algum sistema.
  const canCreateWorkItem = (ctx: TPowerKContext) =>
    canDo("issue.create", ctx.params.workspaceSlug?.toString()) && joinedProjectIds.length > 0;
  const canCreateProject = (ctx: TPowerKContext) => canDo("project.create", ctx.params.workspaceSlug?.toString());
  // Criar página, visão, ciclo ou módulo no sistema aberto: a ação e participar dele.
  const canCreateInProject = (ctx: TPowerKContext, action: string) =>
    canDoInProject(action, ctx.params.workspaceSlug?.toString(), ctx.params.projectId?.toString());
  const isWorkspaceCreationDisabled = config?.is_workspace_creation_disabled ?? false;

  const getProjectDetails = (ctx: TPowerKContext) =>
    ctx.params.projectId ? getPartialProjectById(ctx.params.projectId.toString()) : undefined;

  return {
    create_work_item: {
      id: "create_work_item",
      type: "action",
      group: "create",
      i18n_title: "power_k.creation_actions.create_work_item",
      icon: LayersIcon,
      keySequence: "ni",
      action: () => toggleCreateIssueModal(true),
      isEnabled: (ctx) => canCreateWorkItem(ctx),
      isVisible: (ctx) => canCreateWorkItem(ctx),
      closeOnSelect: true,
    },
    create_page: {
      id: "create_page",
      type: "action",
      group: "create",
      i18n_title: "power_k.creation_actions.create_page",
      icon: FileText,
      keySequence: "nd",
      action: () => toggleCreatePageModal({ isOpen: true }),
      isEnabled: (ctx) => Boolean(getProjectDetails(ctx)?.page_view && canCreateInProject(ctx, "page.create")),
      isVisible: (ctx) =>
        Boolean(ctx.params.projectId && getProjectDetails(ctx)?.page_view && canCreateInProject(ctx, "page.create")),
      closeOnSelect: true,
    },
    create_view: {
      id: "create_view",
      type: "action",
      group: "create",
      i18n_title: "power_k.creation_actions.create_view",
      icon: Layers,
      keySequence: "nv",
      action: () => toggleCreateViewModal(true),
      isEnabled: (ctx) => Boolean(getProjectDetails(ctx)?.issue_views_view && canCreateInProject(ctx, "view.create")),
      isVisible: (ctx) =>
        Boolean(
          ctx.params.projectId && getProjectDetails(ctx)?.issue_views_view && canCreateInProject(ctx, "view.create")
        ),
      closeOnSelect: true,
    },
    create_cycle: {
      id: "create_cycle",
      type: "action",
      group: "create",
      i18n_title: "power_k.creation_actions.create_cycle",
      icon: ContrastIcon,
      keySequence: "nc",
      action: () => toggleCreateCycleModal(true),
      isEnabled: (ctx) => Boolean(getProjectDetails(ctx)?.cycle_view && canCreateInProject(ctx, "cycle.manage")),
      isVisible: (ctx) =>
        Boolean(ctx.params.projectId && getProjectDetails(ctx)?.cycle_view && canCreateInProject(ctx, "cycle.manage")),
      closeOnSelect: true,
    },
    create_module: {
      id: "create_module",
      type: "action",
      group: "create",
      i18n_title: "power_k.creation_actions.create_module",
      icon: DiceIcon,
      keySequence: "nm",
      action: () => toggleCreateModuleModal(true),
      isEnabled: (ctx) => Boolean(getProjectDetails(ctx)?.module_view && canCreateInProject(ctx, "module.manage")),
      isVisible: (ctx) =>
        Boolean(ctx.params.projectId && getProjectDetails(ctx)?.module_view && canCreateInProject(ctx, "module.manage")),
      closeOnSelect: true,
    },
    create_project: {
      id: "create_project",
      type: "action",
      group: "create",
      i18n_title: "power_k.creation_actions.create_project",
      icon: FolderPlus,
      keySequence: "np",
      action: () => toggleCreateProjectModal(true),
      isEnabled: (ctx) => canCreateProject(ctx),
      isVisible: (ctx) => canCreateProject(ctx),
      closeOnSelect: true,
    },
    create_workspace: {
      id: "create_workspace",
      type: "action",
      group: "create",
      i18n_title: "power_k.creation_actions.create_workspace",
      icon: SquarePlus,
      action: (ctx) => ctx.router.push("/create-workspace"),
      isEnabled: () => Boolean(!isWorkspaceCreationDisabled),
      isVisible: () => Boolean(!isWorkspaceCreationDisabled),
      closeOnSelect: true,
    },
  };
};
