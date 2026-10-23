/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useTranslation } from "@plane/i18n";
import { Intake } from "@plane/propel/icons";
import { Breadcrumbs, Header } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { readRotuloDaTriagem } from "@/components/inbox/global/rotulo-da-triagem";
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";

export const GlobalIntakeHeader = observer(function GlobalIntakeHeader() {
  const { workspaceSlug } = useParams();
  const { can } = useMyWorkspaceActions(workspaceSlug?.toString());
  const { t } = useTranslation();
  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs>
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                label={t(readRotuloDaTriagem(can))}
                icon={<Intake className="size-4 text-secondary" />}
              />
            }
          />
        </Breadcrumbs>
      </Header.LeftItem>
    </Header>
  );
});
