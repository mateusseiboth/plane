/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { LineChart as IconeDoGrafico } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipProps } from "recharts";
// hooks
import { useSerieDeChamados } from "@/hooks/use-home-painel";
// services
import type { TPeriodoDoPainel, TPontoDaSerie } from "@/services/home-painel.service";
// local imports
import { CartaoDoPainel, EsqueletoDoCartao, VazioDoCartao } from "./cartao";
import { formatDiaDoEixo, formatDiaPorExtenso } from "./painel-rules";
import { SeletorDePeriodo } from "./seletor-de-periodo";

/**
 * As duas séries e as suas cores. As cores são tokens do tema
 * (`--chart-series-*`): o passo do escuro troca sozinho com o tema.
 */
const SERIES = [
  { chave: "abertos", rotulo: "Abertos", cor: "var(--chart-series-1)", classeDaCor: "bg-chart-series-1" },
  { chave: "encerrados", rotulo: "Encerrados", cor: "var(--chart-series-2)", classeDaCor: "bg-chart-series-2" },
] as const;

type TChaveDaSerie = (typeof SERIES)[number]["chave"];

const EIXO = { fontSize: 11, fill: "var(--txt-tertiary)" };

function LegendaDaSerie({ totais }: { totais: Record<TChaveDaSerie, number> }) {
  return (
    <ul className="mb-4 flex flex-wrap items-end gap-6">
      {SERIES.map((serie) => (
        <li key={serie.chave} className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-12 text-secondary">
            <span aria-hidden className={`h-0.5 w-3 rounded-full ${serie.classeDaCor}`} />
            {serie.rotulo}
          </span>
          <span className="text-24 leading-none font-semibold text-primary">{totais[serie.chave]}</span>
        </li>
      ))}
    </ul>
  );
}

/** Um tooltip, as duas séries: o valor em destaque, o nome da série em segundo plano. */
function DicaDaSerie({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-subtle bg-surface-1 px-3 py-2 shadow-overlay-100">
      <p className="mb-1 text-11 text-tertiary first-letter:uppercase">{formatDiaPorExtenso(String(label))}</p>
      {SERIES.map((serie) => (
        <p key={serie.chave} className="flex items-center gap-2 text-12">
          <span aria-hidden className={`h-0.5 w-3 rounded-full ${serie.classeDaCor}`} />
          <span className="font-semibold text-primary tabular-nums">
            {payload.find((p) => p.dataKey === serie.chave)?.value ?? 0}
          </span>
          <span className="text-tertiary">{serie.rotulo.toLowerCase()}</span>
        </p>
      ))}
    </div>
  );
}

/** A mesma série em tabela, para leitor de tela: o gráfico não pode ser o único caminho até o número. */
function TabelaDaSerie({ dias }: { dias: TPontoDaSerie[] }) {
  return (
    <table className="sr-only">
      <caption>Chamados abertos e encerrados por dia</caption>
      <thead>
        <tr>
          <th scope="col">Dia</th>
          {SERIES.map((serie) => (
            <th key={serie.chave} scope="col">
              {serie.rotulo}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {dias.map((dia) => (
          <tr key={dia.data}>
            <th scope="row">{formatDiaDoEixo(dia.data)}</th>
            <td>{dia.abertos}</td>
            <td>{dia.encerrados}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GraficoDaSerie({ dias }: { dias: TPontoDaSerie[] }) {
  return (
    <div aria-hidden className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={dias} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
          <CartesianGrid vertical={false} stroke="var(--border-subtle)" strokeWidth={1} />
          <XAxis
            dataKey="data"
            tickFormatter={formatDiaDoEixo}
            tick={EIXO}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            tickMargin={8}
          />
          <YAxis allowDecimals={false} tick={EIXO} tickLine={false} axisLine={false} width={48} />
          <Tooltip
            content={<DicaDaSerie />}
            cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
            isAnimationActive={false}
          />
          {SERIES.map((serie) => (
            <Area
              key={serie.chave}
              type="monotone"
              dataKey={serie.chave}
              name={serie.rotulo}
              stroke={serie.cor}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill={serie.cor}
              fillOpacity={0.1}
              dot={false}
              activeDot={{ r: 4, fill: serie.cor, stroke: "var(--bg-surface-1)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const isSemMovimento = (dias: TPontoDaSerie[]) => dias.every((d) => d.abertos === 0 && d.encerrados === 0);

export function SerieDeChamados({ workspaceSlug }: { workspaceSlug: string }) {
  const [periodo, setPeriodo] = useState<TPeriodoDoPainel>("semana");
  const { data, isLoading, isFetching } = useSerieDeChamados(workspaceSlug, periodo);

  const conteudo = () => {
    if (isLoading || !data) return <EsqueletoDoCartao altura="h-72" />;
    if (isSemMovimento(data.dias))
      return (
        <VazioDoCartao
          icone={IconeDoGrafico}
          titulo="Nenhum chamado no período"
          detalhe="Os chamados que você abrir ou encerrar aparecem aqui."
        />
      );
    return (
      <>
        <LegendaDaSerie totais={{ abertos: data.total_abertos, encerrados: data.total_encerrados }} />
        <GraficoDaSerie dias={data.dias} />
        <TabelaDaSerie dias={data.dias} />
      </>
    );
  };

  return (
    <CartaoDoPainel
      titulo="Meus chamados"
      subtitulo="Abertos e encerrados por dia, como responsável ou autor"
      acao={<SeletorDePeriodo valor={periodo} onChange={setPeriodo} rotulo="Período da série" />}
      isAtualizando={isFetching && !isLoading}
    >
      {conteudo()}
    </CartaoDoPainel>
  );
}
