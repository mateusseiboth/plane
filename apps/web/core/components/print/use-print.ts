/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";

export type TPrintMode = "document" | "area";

/**
 * Class toggled on <html> while the print dialog is open. Each mode has its own
 * rules in styles/print.css, so the strategy is picked by class name instead of
 * by branching inside the components.
 */
const PRINT_MODE_CLASS: Record<TPrintMode, string> = {
  document: "print-mode-document",
  area: "print-mode-area",
};

const clearPrintClasses = () => {
  Object.values(PRINT_MODE_CLASS).forEach((className) => document.documentElement.classList.remove(className));
};

/**
 * Opens the browser print dialog for the current page.
 *
 * `document` prints the hidden <PrintDocument /> portal (default, paginates
 * properly), `area` prints the element flagged with `data-print-area` — used
 * when the content must stay visible to be measured (charts).
 *
 * The document title is what most browsers use as the suggested PDF file name,
 * so it is swapped while printing and restored afterwards.
 */
export const usePrint = () => {
  const print = useCallback((options?: { mode?: TPrintMode; documentTitle?: string }) => {
    if (typeof window === "undefined") return;

    const mode = options?.mode ?? "document";
    const previousTitle = document.title;

    document.documentElement.classList.add(PRINT_MODE_CLASS[mode]);
    if (options?.documentTitle) document.title = options.documentTitle;

    const restore = () => {
      clearPrintClasses();
      document.title = previousTitle;
    };

    window.addEventListener("afterprint", restore, { once: true });

    // Give React/portal one frame to paint before the dialog freezes the DOM.
    window.requestAnimationFrame(() => {
      window.print();
      // Safari never fires `afterprint`, so restore defensively as well.
      window.setTimeout(restore, 1000);
    });
  }, []);

  return { print };
};
