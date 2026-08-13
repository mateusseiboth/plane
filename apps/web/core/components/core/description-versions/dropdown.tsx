/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { History } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TDescriptionVersion } from "@plane/types";
import { CustomMenu } from "@plane/ui";
import { calculateTimeAgo } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
// local imports
import { DescriptionVersionsDropdownItem } from "./dropdown-item";
import type { TDescriptionVersionEntityInformation, TEdicaoDoChamado } from "./root";

/** A mais recente entre duas edições, quando existem. */
const maisRecente = (a: TEdicaoDoChamado | undefined, b: TEdicaoDoChamado | undefined) => {
  if (!a || !b) return a ?? b;
  return a.at > b.at ? a : b;
};

type Props = {
  disabled: boolean;
  entityInformation: TDescriptionVersionEntityInformation;
  onVersionClick: (versionId: string) => void;
  versions: TDescriptionVersion[] | undefined;
};

export const DescriptionVersionsDropdown = observer(function DescriptionVersionsDropdown(props: Props) {
  const { disabled, entityInformation, onVersionClick, versions } = props;
  // store hooks
  const { getUserDetails } = useMember();
  // derived values
  const latestVersion = versions?.[0];
  // Duas fontes para "quem mexeu por último": a versão mais recente da
  // descrição e a trilha de atividades (que também vê a troca de título). Vale
  // a mais recente das duas; a criação do chamado só entra quando não houve
  // edição nenhuma — anunciá-la como "última edição" seria mentira.
  const versionEdit = latestVersion
    ? {
        at: new Date(latestVersion.last_saved_at ?? latestVersion.created_at),
        byDisplayName: latestVersion.owned_by ? getUserDetails(latestVersion.owned_by)?.display_name : undefined,
      }
    : undefined;
  const lastEdit = maisRecente(versionEdit, entityInformation.lastEdit);
  const lastUpdatedAt = lastEdit?.at ?? entityInformation.createdAt;
  const lastUpdatedByUserDisplayName = lastEdit?.byDisplayName ?? entityInformation.createdByDisplayName;
  // translation
  const { t } = useTranslation();

  return (
    <CustomMenu
      label={
        <div className="flex items-center gap-1 text-tertiary">
          <span className="grid size-4 flex-shrink-0 place-items-center">
            <History className="size-3.5" />
          </span>
          <p className="text-11">
            {t("description_versions.last_edited_by")}{" "}
            <span className="font-medium">{lastUpdatedByUserDisplayName ?? t("common.deactivated_user")}</span>{" "}
            {calculateTimeAgo(lastUpdatedAt)}
          </p>
        </div>
      }
      noBorder
      noChevron={disabled}
      placement="bottom-end"
      optionsClassName="w-[300px]"
      disabled={disabled}
      closeOnSelect
    >
      <p className="mb-1 text-11 font-medium text-tertiary">{t("description_versions.previously_edited_by")}</p>
      {versions?.map((version) => (
        <DescriptionVersionsDropdownItem key={version.id} onClick={onVersionClick} version={version} />
      ))}
    </CustomMenu>
  );
});
