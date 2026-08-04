/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { cn, isEmptyHtmlString, sanitizeHTMLForPrint } from "@plane/utils";

type Props = {
  html?: string | null;
  fallback?: string;
  className?: string;
};

/**
 * Renderiza HTML do editor dentro de um documento de impressão, mantendo apenas
 * a formatação que faz sentido no papel.
 */
export const PrintHtml = function PrintHtml(props: Props) {
  const { html, fallback = "—", className } = props;

  if (!html || isEmptyHtmlString(html)) return <p className={className}>{fallback}</p>;

  return (
    <div
      className={cn("print-rich-text", className)}
      dangerouslySetInnerHTML={{ __html: sanitizeHTMLForPrint(html) }}
    />
  );
};
