/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane types
// plane ui
import { useTranslation } from "@plane/i18n";
import { EModalWidth, ModalCore } from "@plane/ui";
import { WidgetList } from "./widget-list";

export type TProps = {
  workspaceSlug: string;
  isModalOpen: boolean;
  handleOnClose?: () => void;
};

export const ManageWidgetsModal = observer(function ManageWidgetsModal(props: TProps) {
  // props
  const { workspaceSlug, isModalOpen, handleOnClose } = props;
  const { t } = useTranslation();

  return (
    <ModalCore isOpen={isModalOpen} handleClose={handleOnClose} width={EModalWidth.MD}>
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-18 font-medium"> {t("home.manage_widgets")}</div>
          {/* Link to our developer documentation so devs know they can build their own widgets. */}
          <a
            href={`/${workspaceSlug}/developers/widgets`}
            onClick={handleOnClose}
            className="shrink-0 text-13 font-medium text-custom-primary-100 hover:underline"
          >
            Como criar um widget? →
          </a>
        </div>
        <WidgetList workspaceSlug={workspaceSlug} />
      </div>
    </ModalCore>
  );
});
