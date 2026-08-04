/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { cn } from "@plane/utils";
// local imports
import { usePrintSettings } from "./use-print-settings";

type Props = {
  className?: string;
};

/** Rodapé configurável do workspace, exibido ao final do documento impresso. */
export const PrintFooter = observer(function PrintFooter(props: Props) {
  const { className } = props;
  const { printSettings } = usePrintSettings();

  if (!printSettings.footer_text) return null;

  return (
    <footer className={cn("print-avoid-break mt-6 border-t border-neutral-300 pt-2 text-[10px]", className)}>
      {printSettings.footer_text}
    </footer>
  );
});
