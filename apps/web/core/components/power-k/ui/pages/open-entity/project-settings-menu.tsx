/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { PROJECT_SETTINGS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// components
import type { TPowerKContext } from "@/components/power-k/core/types";
import { PowerKSettingsMenu } from "@/components/power-k/menus/settings";
import { PROJECT_SETTINGS_ICONS } from "@/components/settings/project/sidebar/item-icon";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";
import { isRequiredActionAllowed } from "@/lib/permissoes/acao-efetiva";

type Props = {
  context: TPowerKContext;
  handleSelect: (href: string) => void;
};

export const PowerKOpenProjectSettingsMenu = observer(function PowerKOpenProjectSettingsMenu(props: Props) {
  const { context, handleSelect } = props;
  const workspaceSlug = context.params.workspaceSlug?.toString();
  const projectId = context.params.projectId?.toString();
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { getProjectRoleByWorkspaceSlugAndProjectId } = useUserPermissions();
  const { canInProject } = useMyWorkspaceActions(workspaceSlug);
  // derived values
  // Participar do sistema é o vínculo; o item ainda pode exigir uma ação da matriz.
  const isProjectMember =
    !!workspaceSlug && !!projectId && getProjectRoleByWorkspaceSlugAndProjectId(workspaceSlug, projectId) !== undefined;
  const settingsList = Object.values(PROJECT_SETTINGS).filter(
    (setting) => isProjectMember && isRequiredActionAllowed(setting.action, (action) => canInProject(action, projectId))
  );
  const settingsListWithIcons = settingsList.map((setting) => ({
    ...setting,
    label: t(setting.i18n_label),
    icon: PROJECT_SETTINGS_ICONS[setting.key],
  }));

  return <PowerKSettingsMenu settings={settingsListWithIcons} onSelect={(setting) => handleSelect(setting.href)} />;
});
