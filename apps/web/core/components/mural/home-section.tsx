/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Megaphone, Plus } from "lucide-react";
import { cn } from "@plane/utils";
// components
import { CLASSE_DO_CARTAO, CartaoDoPainel } from "@/components/home/painel/cartao";
// hooks
import { useMuralActions, useMuralHome } from "@/hooks/use-mural";
// local imports
import { countRecadosNovos } from "./helpers";
import { MuralModais, useMuralModais } from "./modais";
import { MuralRecadoCard } from "./recado-card";

type Props = { workspaceSlug: string };

/** Quantos recados cabem no cartão da home; o resto fica no mural. */
const RECADOS_NA_HOME = 3;

const LINK =
  "flex items-center gap-1 rounded text-12 text-accent-primary hover:underline focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:outline-none";

type TAcoesProps = { workspaceSlug: string; canPublish: boolean; onNew: () => void };

function AcoesDoMural({ workspaceSlug, canPublish, onNew }: TAcoesProps) {
  return (
    <div className="flex shrink-0 items-center gap-3">
      {canPublish && (
        <button type="button" onClick={onNew} className={LINK}>
          <Plus aria-hidden className="size-3" /> Novo recado
        </button>
      )}
      <Link href={`/${workspaceSlug}/mural/`} className={LINK}>
        Ver mural <ArrowRight aria-hidden className="size-3" />
      </Link>
    </div>
  );
}

/** Sem recado novo (ou ainda carregando): uma linha só, com o caminho para o mural. */
function MuralCompacto({ isCarregando, acoes }: { isCarregando: boolean; acoes: ReactNode }) {
  return (
    <section aria-label="Mural de recados" className={cn(CLASSE_DO_CARTAO, "flex items-center gap-3 px-5 py-3")}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent-primary">
        <Megaphone aria-hidden className="size-3.5" />
      </span>
      <p className={cn("min-w-0 flex-1 truncate text-13 text-secondary", isCarregando && "animate-pulse")}>
        <span className="font-medium text-primary">Mural de recados</span>
        {!isCarregando && <span> · Nenhum recado novo</span>}
      </p>
      {acoes}
    </section>
  );
}

/**
 * Mural na home, no topo: com recado novo, os três primeiros da fila (não lidos
 * e fixados antes); sem recado novo, uma linha com o link para o mural.
 */
export function MuralHomeSection({ workspaceSlug }: Props) {
  const { data: recados, isLoading } = useMuralHome(workspaceSlug);
  const { canPublish } = useMuralActions(workspaceSlug);
  const modais = useMuralModais();
  const novos = countRecadosNovos(recados);
  const acoes = <AcoesDoMural workspaceSlug={workspaceSlug} canPublish={canPublish} onNew={modais.onNew} />;

  return (
    <>
      {isLoading || novos === 0 ? (
        <MuralCompacto isCarregando={isLoading} acoes={acoes} />
      ) : (
        <CartaoDoPainel
          titulo="Mural de recados"
          subtitulo={`${novos} ${novos === 1 ? "recado novo" : "recados novos"}`}
          acao={acoes}
        >
          <div className="flex flex-col gap-2">
            {recados?.slice(0, RECADOS_NA_HOME).map((recado) => (
              <MuralRecadoCard key={recado.id} recado={recado} onOpen={modais.onOpen} />
            ))}
          </div>
        </CartaoDoPainel>
      )}
      <MuralModais workspaceSlug={workspaceSlug} modais={modais} />
    </>
  );
}
