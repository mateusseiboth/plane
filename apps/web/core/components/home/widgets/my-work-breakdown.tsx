/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { PieChart } from "lucide-react";
import type { THomeSummary } from "@/services/home-summary.service";
import { HomeCard, PRIORIDADE_COR } from "./card";

const PRIORIDADE_ROTULO: Record<string, string> = {
  urgent: "Urgente",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
  none: "Sem prioridade",
};

type Props = { resumo: THomeSummary | undefined; carregando: boolean };

/**
 * Como os meus chamados abertos se distribuem — por etapa e por prioridade.
 *
 * Responde "onde está a minha fila": tudo parado em Triagem é um problema
 * diferente de tudo parado em Em Teste, e o número total sozinho não conta isso.
 */
export function MyWorkBreakdownWidget({ resumo, carregando }: Props) {
  if (carregando) return <div className="h-52 animate-pulse rounded-xl border border-subtle bg-surface-2" />;

  const etapas = resumo?.por_etapa ?? [];
  const prioridades = resumo?.por_prioridade ?? [];
  const total = etapas.reduce((soma, e) => soma + e.count, 0);

  if (total === 0) {
    return <HomeCard icone={PieChart} titulo="Minha fila" vazio="Nada aberto atribuído a você." />;
  }

  return (
    <HomeCard icone={PieChart} titulo="Minha fila" contagem={total}>
      {/* Barra empilhada: a proporção salta aos olhos antes dos números. */}
      <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-surface-3">
        {etapas.map((etapa) => (
          <div
            key={etapa.name}
            className="h-full"
            style={{ width: `${(etapa.count / total) * 100}%`, backgroundColor: etapa.color || "#8b8b8b" }}
            title={`${etapa.name}: ${etapa.count}`}
          />
        ))}
      </div>

      <ul className="space-y-1.5">
        {etapas.map((etapa) => (
          <li key={etapa.name} className="flex items-center gap-2 text-12">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: etapa.color || "#8b8b8b" }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-secondary">{etapa.name}</span>
            <span className="shrink-0 tabular-nums text-primary">{etapa.count}</span>
          </li>
        ))}
      </ul>

      {prioridades.length > 0 && (
        <div className="mt-3 border-t border-subtle pt-3">
          <p className="mb-1.5 text-11 text-tertiary">Por prioridade</p>
          <ul className="space-y-1.5">
            {prioridades.map((p) => (
              <li key={p.priority} className="flex items-center gap-2 text-12">
                <span className={PRIORIDADE_COR[p.priority] ?? PRIORIDADE_COR.none} aria-hidden>
                  ●
                </span>
                <span className="min-w-0 flex-1 truncate text-secondary">
                  {PRIORIDADE_ROTULO[p.priority] ?? p.priority}
                </span>
                <span className="shrink-0 tabular-nums text-primary">{p.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </HomeCard>
  );
}
