/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
// plane imports
import { cn } from "@plane/utils";
// local imports
import { PrintFooter } from "./print-footer";
import { PrintHeader, type TPrintMetaItem } from "./print-header";

type Props = {
  title: string;
  subtitle?: string | null;
  meta?: TPrintMetaItem[];
  children: React.ReactNode;
  className?: string;
};

/**
 * Documento pronto para impressão. É montado em um portal filho direto de
 * <body> (fica oculto na tela) para que, ao imprimir, o navegador pagine o
 * conteúdo normalmente sem herdar `overflow`/alturas fixas do layout do app.
 *
 * Use junto com `usePrint().print()` no modo padrão (`document`).
 */
export const PrintDocument = function PrintDocument(props: Props) {
  const { title, subtitle, meta, children, className } = props;
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => setIsMounted(true), []);

  if (!isMounted || typeof document === "undefined") return null;

  return createPortal(
    <div className={cn("print-document-root bg-white p-0 font-sans text-xs text-neutral-900", className)}>
      <PrintHeader title={title} subtitle={subtitle} meta={meta} />
      <main>{children}</main>
      <PrintFooter />
    </div>,
    document.body
  );
};
