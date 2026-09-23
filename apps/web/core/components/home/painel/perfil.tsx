/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { cn, getFileURL } from "@plane/utils";
// hooks
import { useMetricasDoMes, usePerfilDaHome } from "@/hooks/use-home-painel";
// services
import type { TMetricaDoMes, TPerfilDaHome } from "@/services/home-painel.service";
// local imports
import { CLASSE_DO_CARTAO } from "./cartao";
import { SEM_VALOR } from "./painel-rules";

/** Enquanto carrega, as quatro casas ficam no lugar: quais métricas são depende do papel. */
const CASAS_CARREGANDO = ["casa-1", "casa-2", "casa-3", "casa-4"];

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

const CLASSE_DA_GRADE =
  "grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-subtle bg-[var(--border-subtle)]";
const CLASSE_DA_CASA = "flex flex-col gap-0.5 bg-surface-1 px-3 py-2.5 dark:bg-layer-1";

function NumerosDoMes({ numeros }: { numeros: TMetricaDoMes[] }) {
  return (
    <dl className={CLASSE_DA_GRADE}>
      {numeros.map((numero) => (
        <div key={numero.rotulo} className={CLASSE_DA_CASA}>
          <dt className="text-11 text-tertiary">{numero.rotulo}</dt>
          <dd className="text-18 leading-tight font-semibold text-primary">{numero.valor}</dd>
          {numero.complemento && <dd className="text-11 text-tertiary">{numero.complemento}</dd>}
        </div>
      ))}
    </dl>
  );
}

function NumerosCarregando() {
  return (
    <div aria-busy className={CLASSE_DA_GRADE}>
      {CASAS_CARREGANDO.map((casa) => (
        <div key={casa} className={cn(CLASSE_DA_CASA, "animate-pulse")}>
          <span className="h-3 w-16 rounded bg-layer-1 dark:bg-layer-2" />
          <span className="text-18 leading-tight font-semibold text-tertiary">{SEM_VALOR}</span>
        </div>
      ))}
    </div>
  );
}

/** Cartão da pessoa: capa com o gradiente da marca, avatar, papel e os quatro números do mês que a API escolheu. */
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
        {metricas ? <NumerosDoMes numeros={metricas} /> : <NumerosCarregando />}
      </div>
    </section>
  );
}
