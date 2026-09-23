/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { cn } from "@plane/utils";
// local imports
import type { TPeriodoDoPainel } from "@/services/home-painel.service";
import { PERIODOS_DO_PAINEL } from "./painel-rules";

type Props = { valor: TPeriodoDoPainel; onChange: (periodo: TPeriodoDoPainel) => void; rotulo: string };

/** Semana, Mês e Trimestre num controle segmentado, com a semântica de grupo de opções. */
export function SeletorDePeriodo({ valor, onChange, rotulo }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label={rotulo}
      className="flex items-center rounded-lg bg-layer-1 p-0.5 dark:bg-layer-2"
    >
      {PERIODOS_DO_PAINEL.map((periodo) => {
        const isAtivo = periodo.valor === valor;
        return (
          <button
            key={periodo.valor}
            type="button"
            role="radio"
            aria-checked={isAtivo}
            onClick={() => onChange(periodo.valor)}
            className={cn(
              "rounded-md px-2.5 py-1 text-12 font-medium transition-colors focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:outline-none",
              isAtivo ? "bg-surface-1 text-primary shadow-raised-100" : "text-tertiary hover:text-secondary"
            )}
          >
            {periodo.rotulo}
          </button>
        );
      })}
    </div>
  );
}
