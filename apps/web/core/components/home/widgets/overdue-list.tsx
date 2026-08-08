/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { renderFormattedDate } from "@plane/utils";
import type { THomeOverdueItem } from "@/services/home-summary.service";
import { HomeCard, PRIORIDADE_COR } from "./card";

type Props = {
  workspaceSlug: string;
  itens: THomeOverdueItem[];
  carregando: boolean;
};

/** Quantos dias o prazo já passou. */
function diasDeAtraso(data: string | null): number {
  if (!data) return 0;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(data);
  alvo.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((hoje.getTime() - alvo.getTime()) / 86400000));
}

/**
 * Chamados meus com prazo estourado.
 *
 * Fica no topo da coluna principal porque é a única lista da home que exige
 * ação hoje — e some por completo quando não há nada atrasado, em vez de
 * ocupar espaço com um "tudo em dia" permanente.
 */
export function OverdueWidget({ workspaceSlug, itens, carregando }: Props) {
  if (carregando) return <div className="h-40 animate-pulse rounded-xl border border-subtle bg-surface-2" />;
  if (itens.length === 0) return null;

  return (
    <HomeCard
      icone={AlertTriangle}
      titulo="Passaram do prazo"
      contagem={itens.length}
      tom="danger"
      acao={{ rotulo: "Ver todos", href: `/${workspaceSlug}/workspace-views/all-issues/` }}
    >
      <ul className="divide-y divide-subtle">
        {itens.map((item) => {
          const atraso = diasDeAtraso(item.target_date);
          return (
            <li key={item.id}>
              <Link
                href={`/${workspaceSlug}/projects/${item.project_id}/issues/${item.id}`}
                className="flex items-center gap-3 px-1 py-2 transition-colors hover:bg-surface-2"
              >
                <span className={PRIORIDADE_COR[item.priority] ?? PRIORIDADE_COR.none} aria-hidden>
                  ●
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-13 text-primary">{item.name}</span>
                  <span className="block truncate text-11 text-tertiary">
                    {item.project_identifier}-{item.sequence_id} · {item.project_name}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-12 font-medium text-danger-primary">
                    {atraso === 1 ? "1 dia" : `${atraso} dias`}
                  </span>
                  <span className="block text-11 text-tertiary">{renderFormattedDate(item.target_date ?? "")}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </HomeCard>
  );
}
