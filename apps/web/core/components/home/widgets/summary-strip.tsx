/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { AlertTriangle, CalendarClock, Inbox, Layers, PenLine, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@plane/utils";
import type { THomeSummary } from "@/services/home-summary.service";

type TIndicador = {
  chave: keyof THomeSummary;
  rotulo: string;
  icone: typeof Layers;
  href: (slug: string) => string;
  /** Destaque quando o número for maior que zero — só para o que pede ação. */
  alerta?: "danger" | "warning";
};

/**
 * A faixa responde, em ordem, as perguntas do começo do dia:
 * o que é meu, o que já estourou, o que vence hoje, o que eu abri, o que está
 * esperando triagem e o que a equipe entregou.
 */
const INDICADORES: TIndicador[] = [
  {
    chave: "meus_abertos",
    rotulo: "Meus chamados",
    icone: Layers,
    href: (s) => `/${s}/workspace-views/all-issues/`,
  },
  {
    chave: "meus_atrasados",
    rotulo: "Atrasados",
    icone: AlertTriangle,
    href: (s) => `/${s}/workspace-views/all-issues/`,
    alerta: "danger",
  },
  {
    chave: "meus_vencem_hoje",
    rotulo: "Vencem hoje",
    icone: CalendarClock,
    href: (s) => `/${s}/workspace-views/all-issues/`,
    alerta: "warning",
  },
  {
    chave: "abertos_por_mim",
    rotulo: "Abertos por mim",
    icone: PenLine,
    href: (s) => `/${s}/workspace-views/all-issues/`,
  },
  {
    chave: "solicitacoes_pendentes",
    rotulo: "Aguardando triagem",
    icone: Inbox,
    href: (s) => `/${s}/global-intake/`,
  },
  {
    chave: "concluidos_7d",
    rotulo: "Concluídos (7 dias)",
    icone: CheckCircle2,
    href: (s) => `/${s}/analytics/work-items/`,
  },
];

const CORES_ALERTA = {
  danger: "text-danger-primary",
  warning: "text-warning-primary",
} as const;

type Props = {
  workspaceSlug: string;
  resumo: THomeSummary | undefined;
  carregando: boolean;
};

export function HomeSummaryStrip({ workspaceSlug, resumo, carregando }: Props) {
  if (carregando) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {INDICADORES.map((i) => (
          <div key={i.chave} className="h-[86px] animate-pulse rounded-xl border border-subtle bg-surface-2" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {INDICADORES.map((indicador) => {
        const valor = (resumo?.[indicador.chave] as number) ?? 0;
        const Icone = indicador.icone;
        // A cor de alerta só aparece quando há de fato algo a fazer: um "0"
        // vermelho treina a pessoa a ignorar o vermelho.
        const destaque = indicador.alerta && valor > 0 ? CORES_ALERTA[indicador.alerta] : "text-primary";
        return (
          <Link
            key={indicador.chave}
            href={indicador.href(workspaceSlug)}
            className="group flex flex-col justify-between rounded-xl border border-subtle bg-surface-1 px-4 py-3 transition-colors hover:border-accent-subtle-1 hover:bg-surface-2"
          >
            <div className="flex items-center gap-1.5 text-11 text-secondary">
              <Icone className="size-3.5 shrink-0" />
              <span className="truncate">{indicador.rotulo}</span>
            </div>
            <span className={cn("mt-1.5 text-24 font-semibold leading-none tabular-nums", destaque)}>{valor}</span>
          </Link>
        );
      })}
    </div>
  );
}
