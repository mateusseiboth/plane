/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { cn, getFileURL } from "@plane/utils";
// hooks
import { useMetricasDoMes, usePerfilDaHome } from "@/hooks/use-home-painel";
// services
import type { TMetricasDoMes, TPerfilDaHome } from "@/services/home-painel.service";
// local imports
import { CLASSE_DO_CARTAO } from "./cartao";
import { SEM_VALOR, formatDuracao, formatRanking } from "./painel-rules";

type TNumeroDoMes = { rotulo: string; valor: string; detalhe?: string };

const buildNumerosDoMes = (m: TMetricasDoMes): TNumeroDoMes[] => {
  const ranking = formatRanking(m.ranking);
  return [
    { rotulo: "Encerrados", valor: String(m.encerrados), detalhe: "no mês" },
    { rotulo: "Em aberto", valor: String(m.em_aberto), detalhe: "com você" },
    { rotulo: "Tempo médio", valor: formatDuracao(m.tempo_medio_resolucao_horas), detalhe: "até encerrar" },
    { rotulo: "Ranking", valor: ranking.valor, detalhe: ranking.detalhe },
  ];
};

const NUMEROS_CARREGANDO: TNumeroDoMes[] = ["Encerrados", "Em aberto", "Tempo médio", "Ranking"].map((rotulo) => ({
  rotulo,
  valor: SEM_VALOR,
}));

const readIniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");

function AvatarDaPessoa({ perfil }: { perfil?: TPerfilDaHome }) {
  const classe =
    "size-16 rounded-full object-cover outline-4 outline-[var(--bg-surface-1)] dark:outline-[var(--bg-layer-1)]";
  if (perfil?.avatar_url) return <img src={getFileURL(perfil.avatar_url)} alt="" className={classe} />;
  return (
    <span
      aria-hidden
      className={cn(
        classe,
        "flex items-center justify-center bg-accent-subtle text-20 font-semibold text-accent-primary"
      )}
    >
      {readIniciais(perfil?.nome ?? "")}
    </span>
  );
}

function NumerosDoMes({ numeros, isCarregando }: { numeros: TNumeroDoMes[]; isCarregando: boolean }) {
  return (
    <dl
      aria-busy={isCarregando}
      className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-subtle bg-[var(--border-subtle)]"
    >
      {numeros.map((numero) => (
        <div key={numero.rotulo} className="flex flex-col gap-0.5 bg-surface-1 px-3 py-2.5 dark:bg-layer-1">
          <dt className="text-11 text-tertiary">{numero.rotulo}</dt>
          <dd className={cn("text-18 leading-tight font-semibold text-primary", isCarregando && "animate-pulse")}>
            {numero.valor}
          </dd>
          {numero.detalhe && <dd className="text-11 text-tertiary">{numero.detalhe}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** Cartão da pessoa: capa com o gradiente da marca, avatar, papel e os quatro números do mês. */
export function PerfilDaHome({ workspaceSlug }: { workspaceSlug: string }) {
  const { data: perfil, isLoading } = usePerfilDaHome(workspaceSlug);
  const { data: metricas } = useMetricasDoMes(workspaceSlug);

  return (
    <section aria-label="Seu perfil" className={cn(CLASSE_DO_CARTAO, "overflow-hidden")}>
      <div
        aria-hidden
        className="h-20 bg-[linear-gradient(120deg,var(--brand-default)_0%,var(--brand-700)_60%,var(--brand-500)_100%)]"
      />
      <div className="-mt-8 flex flex-col gap-4 px-5 pb-5">
        <AvatarDaPessoa perfil={perfil} />
        {isLoading || !perfil ? (
          <div aria-hidden className="flex animate-pulse flex-col gap-2">
            <span className="h-4 w-40 rounded bg-layer-1 dark:bg-layer-2" />
            <span className="h-3 w-24 rounded bg-layer-1 dark:bg-layer-2" />
          </div>
        ) : (
          <div className="min-w-0">
            <p className="truncate text-16 font-semibold text-primary">{perfil.nome}</p>
            <p className="truncate text-12 text-secondary">
              {[perfil.papel, perfil.equipe].filter(Boolean).join(" · ")}
            </p>
          </div>
        )}
        <NumerosDoMes numeros={metricas ? buildNumerosDoMes(metricas) : NUMEROS_CARREGANDO} isCarregando={!metricas} />
      </div>
    </section>
  );
}
