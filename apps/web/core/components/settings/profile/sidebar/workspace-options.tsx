/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Blocks, CirclePlus, Mails, Puzzle } from "lucide-react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
// components
import { SettingsSidebarItem } from "@/components/settings/sidebar/item";
import { WorkspaceLogo } from "@/components/workspace/logo";
// hooks
import { useCanManageExtensions } from "@/hooks/use-extensions-access";
import { useWorkspace } from "@/hooks/store/use-workspace";

export const ProfileSettingsSidebarWorkspaceOptions = observer(function ProfileSettingsSidebarWorkspaceOptions() {
  // store hooks
  const { workspaces } = useWorkspace();
  // extensions access (admin de instância ou TI)
  const canManageExtensions = useCanManageExtensions();
  // translation
  const { t } = useTranslation();

  return (
    <div className="shrink-0">
      <div className="p-2 text-caption-md-medium text-tertiary capitalize">{t("common.workspace")}</div>
      <div className="flex flex-col">
        {Object.values(workspaces).map((workspace) => (
          <SettingsSidebarItem
            key={workspace.id}
            as="link"
            href={`/${workspace.slug}/`}
            iconNode={<WorkspaceLogo logo={workspace.logo_url} name={workspace.name} classNames="shrink-0" />}
            label={workspace.name}
            isActive={false}
          />
        ))}
        <div className="mt-1.5">
          <SettingsSidebarItem
            as="link"
            href="/create-workspace/"
            icon={CirclePlus}
            label={t("create_workspace")}
            isActive={false}
          />
          <SettingsSidebarItem
            as="link"
            href="/invitations/"
            icon={Mails}
            label={t("workspace_invites")}
            isActive={false}
          />
        </div>

        {/* Extensões (admin de instância ou grupo TI) */}
        {canManageExtensions && (
          <div className="mt-1.5">
            <div className="p-2 text-caption-md-medium text-tertiary capitalize">Extensões</div>
            <SettingsSidebarItem as="link" href="/settings/plugins/" icon={Puzzle} label="Plugins" isActive={false} />
            <SettingsSidebarItem as="link" href="/settings/widgets/" icon={Blocks} label="Widgets" isActive={false} />
          </div>
        )}
      </div>
    </div>
  );
});
