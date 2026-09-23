/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { BarChart3 } from "lucide-react";
// hooks
import { useChamadosPorSistema } from "@/hooks/use-home-painel";
// services
import type { TPeriodoDoPainel, TSistemaDoPainel } from "@/services/home-painel.service";
// local imports
import { CartaoDoPainel, EsqueletoDoCartao, VazioDoCartao } from "./cartao";
import { SeletorDePeriodo } from "./seletor-de-periodo";

/**
 * Barras horizontais em HTML: uma série só (cor 1 do tema), valor na ponta da
 * barra e a lista inteira legível sem passar o mouse.
 */
function BarrasDosSistemas({ sistemas }: { sistemas: TSistemaDoPainel[] }) {
  const maior = Math.max(...sistemas.map((s) => s.total), 1);
  return (
    <ol className="flex flex-col gap-3">
      {sistemas.map((sistema) => (
        <li key={sistema.project_id} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-12">
            <span className="min-w-0 truncate text-secondary" title={sistema.project_name}>
              {sistema.project_name}
            </span>
            <span className="shrink-0 font-semibold text-primary tabular-nums">{sistema.total}</span>
          </div>
          <div aria-hidden className="h-2 w-full rounded-r bg-layer-1 dark:bg-layer-2">
            {/* Largura é dado, não estilo: não há classe que a represente. */}
            <div
              className="h-full rounded-r bg-chart-series-1"
              style={{ width: `${Math.max((sistema.total / maior) * 100, 2)}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ChamadosPorSistema({ workspaceSlug }: { workspaceSlug: string }) {
  const [periodo, setPeriodo] = useState<TPeriodoDoPainel>("mes");
  const { data, isLoading, isFetching } = useChamadosPorSistema(workspaceSlug, periodo);

  const conteudo = () => {
    if (isLoading || !data) return <EsqueletoDoCartao linhas={4} />;
    if (!data.sistemas.length) return <VazioDoCartao icone={BarChart3} titulo="Nenhum chamado aberto no período" />;
    return <BarrasDosSistemas sistemas={data.sistemas} />;
  };

  return (
    <CartaoDoPainel
      titulo="Chamados por sistema"
      subtitulo="Abertos no período"
      acao={<SeletorDePeriodo valor={periodo} onChange={setPeriodo} rotulo="Período dos sistemas" />}
      isAtualizando={isFetching && !isLoading}
    >
      {conteudo()}
    </CartaoDoPainel>
  );
}
