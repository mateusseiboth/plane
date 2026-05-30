/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import {observer} from "mobx-react";
import {useState} from "react";
// ui
import {useTranslation} from "@plane/i18n";
import {Tooltip} from "@plane/propel/tooltip";
// hooks
import {usePlatformOS} from "@/hooks/use-platform-os";
import packageJson from "package.json";
// local components
import {PaidPlanUpgradeModal} from "../license";

export const WorkspaceEditionBadge = observer(function WorkspaceEditionBadge() {
  // states
  const [isPaidPlanPurchaseModalOpen, setIsPaidPlanPurchaseModalOpen] = useState(false);
  // translation
  const {t} = useTranslation();
  // platform
  const {isMobile} = usePlatformOS();

  return (
    <>
      <PaidPlanUpgradeModal
        isOpen={isPaidPlanPurchaseModalOpen}
        handleClose={() => setIsPaidPlanPurchaseModalOpen(false)}
      />
      <Tooltip
        tooltipContent={`Version: v${packageJson.version}`}
        isMobile={isMobile}
      >
        <div
          aria-haspopup="dialog"
          aria-label={t("aria_labels.projects_sidebar.edition_badge")}
        >
          Feito com ❤️
        </div>
      </Tooltip>
    </>
  );
});
