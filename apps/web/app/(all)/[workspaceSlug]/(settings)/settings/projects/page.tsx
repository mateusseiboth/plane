/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useTheme } from "next-themes";
// plane imports
import { PROJECT_TRACKER_ELEMENTS } from "@plane/constants";
import { Button } from "@plane/propel/button";
// assets
import ProjectDarkEmptyState from "@/app/assets/empty-state/project-settings/no-projects-dark.png?url";
import ProjectLightEmptyState from "@/app/assets/empty-state/project-settings/no-projects-light.png?url";
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";

function ProjectSettingsPage() {
  // store hooks
  const { resolvedTheme } = useTheme();
  const { toggleCreateProjectModal } = useCommandPalette();
  // derived values
  const resolvedPath = resolvedTheme === "dark" ? ProjectDarkEmptyState : ProjectLightEmptyState;
  return (
    <div className="mx-auto flex h-full max-w-[480px] flex-col items-center justify-center gap-4">
      <img src={resolvedPath} alt="Nenhum projeto ainda" />
      <div className="text-16 font-semibold text-tertiary">Nenhum projeto ainda</div>
      <div className="text-center text-13 text-tertiary">
        Os projetos são a base do trabalho orientado a metas. Com eles você gerencia suas equipes, tarefas e tudo o
        que for necessário para concluir as entregas.
      </div>
      <div className="flex gap-2">
        <Button
          onClick={() => toggleCreateProjectModal(true)}
          data-ph-element={PROJECT_TRACKER_ELEMENTS.EMPTY_STATE_CREATE_PROJECT_BUTTON}
        >
          Comece seu primeiro projeto
        </Button>
      </div>
    </div>
  );
}

export default observer(ProjectSettingsPage);
