/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { AlertCircle, Paperclip, Pin } from "lucide-react";
import { calculateTimeAgo, cn } from "@plane/utils";
// services
import type { TMuralRecado } from "@/services/mural.service";

type Props = { recado: TMuralRecado; onOpen: (recado: TMuralRecado) => void };

/** Selos do recado, na ordem em que aparecem. */
const SELOS: { isVisivel: (r: TMuralRecado) => boolean; rotulo: string; className: string }[] = [
  { isVisivel: (r) => !r.is_read, rotulo: "Novo", className: "bg-accent-primary/15 text-accent-primary" },
  { isVisivel: (r) => r.is_required, rotulo: "Obrigatório", className: "bg-orange-500/15 text-orange-600" },
  { isVisivel: (r) => r.is_expired, rotulo: "Vencido", className: "bg-layer-1 text-tertiary" },
  { isVisivel: (r) => !r.is_active, rotulo: "Inativo", className: "bg-red-500/15 text-red-600" },
];

/** Linha de recado da home e do histórico. Não lido fica em destaque. */
export function MuralRecadoCard({ recado, onOpen }: Props) {
  return (
    <button
      type="button"
      onClick={() => onOpen(recado)}
      className={cn(
        "flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left transition-colors hover:bg-surface-2",
        recado.is_read ? "border-subtle" : "border-accent-primary/40 bg-accent-primary/5"
      )}
    >
      <span className="mt-0.5 shrink-0 text-secondary">
        {recado.is_pinned ? (
          <Pin className="h-4 w-4 text-accent-primary" />
        ) : (
          <AlertCircle className={cn("h-4 w-4", recado.is_read ? "text-tertiary" : "text-accent-primary")} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className={cn("truncate text-13", recado.is_read ? "text-primary" : "font-semibold text-primary")}>
            {recado.title}
          </span>
          {SELOS.filter((s) => s.isVisivel(recado)).map((s) => (
            <span key={s.rotulo} className={cn("rounded-full px-1.5 py-0.5 text-10 font-semibold", s.className)}>
              {s.rotulo}
            </span>
          ))}
          {recado.attachment && <Paperclip className="h-3 w-3 text-tertiary" />}
        </span>
        <span className="line-clamp-1 text-12 text-secondary">{recado.description_stripped}</span>
      </span>
      <span className="shrink-0 text-11 text-tertiary">
        {recado.author?.display_name && `${recado.author.display_name} · `}
        {calculateTimeAgo(recado.published_at)}
      </span>
    </button>
  );
}
