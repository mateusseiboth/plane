/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { PhoneCall } from "lucide-react";
import { CANAL_FILTROS } from "@/components/chat/ligacoes/ligacao-helpers";

/** Filtro por tipo na lista de atendimentos: todos, conversas ou ligações. */
export function FiltroDeCanal({ value, onChange }: { value: string; onChange: (canal: string) => void }) {
  return (
    <div className="flex gap-1 border-b border-subtle px-3 py-1.5">
      {CANAL_FILTROS.map((f) => (
        <button
          key={f.value}
          onClick={() => onChange(f.value)}
          className={`rounded-md px-2 py-0.5 text-11 transition-colors ${
            value === f.value ? "bg-layer-2 font-semibold text-primary" : "text-tertiary hover:text-primary"
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

/** Marca de ligação na lista, ao lado do status. */
export function MarcaDeLigacao() {
  return (
    <span className="flex items-center gap-0.5 text-10 text-tertiary">
      <PhoneCall className="h-2.5 w-2.5" />
      Ligação
    </span>
  );
}
