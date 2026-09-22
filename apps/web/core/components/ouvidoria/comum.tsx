/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const campoFiltro =
  "h-8 rounded border border-subtle bg-surface-2 px-2 text-12 text-primary outline-none focus:border-accent-primary";

export const botaoSecundario =
  "inline-flex items-center gap-1.5 rounded border border-subtle px-3 py-1.5 text-13 font-medium text-primary hover:bg-surface-2 disabled:opacity-50";

export const botaoPrimario =
  "inline-flex items-center gap-1.5 rounded bg-accent-primary px-3 py-1.5 text-13 font-medium text-white hover:bg-accent-primary/90 disabled:opacity-50";

type TCabecalhoProps = { icone: ReactNode; titulo: string; subtitulo?: string; children?: ReactNode };

export function CabecalhoDaPagina({ icone, titulo, subtitulo, children }: TCabecalhoProps) {
  return (
    <div className="flex items-center justify-between border-b border-subtle px-6 py-4">
      <div className="flex items-center gap-2">
        {icone}
        <div>
          <h1 className="text-lg font-semibold">{titulo}</h1>
          {subtitulo && <p className="text-13 text-secondary">{subtitulo}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

export function AvisoDaPagina({ children }: { children: ReactNode }) {
  return <p className="rounded border border-subtle bg-surface-2 px-4 py-3 text-13 text-secondary">{children}</p>;
}

type TPaginacaoProps = {
  pagina: number;
  hasPrev: boolean;
  hasNext: boolean;
  onChange: (pagina: number) => void;
};

export function Paginacao({ pagina, hasPrev, hasNext, onChange }: TPaginacaoProps) {
  if (!hasPrev && !hasNext) return null;
  return (
    <div className="flex items-center justify-end gap-2 pt-2 text-12 text-secondary">
      <button
        type="button"
        aria-label="Página anterior"
        disabled={!hasPrev}
        onClick={() => onChange(Math.max(0, pagina - 1))}
        className="rounded border border-subtle p-1 disabled:opacity-40"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span>Página {pagina + 1}</span>
      <button
        type="button"
        aria-label="Próxima página"
        disabled={!hasNext}
        onClick={() => onChange(pagina + 1)}
        className="rounded border border-subtle p-1 disabled:opacity-40"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
