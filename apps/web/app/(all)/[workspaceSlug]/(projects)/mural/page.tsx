/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Megaphone, Plus } from "lucide-react";
// components
import { PageHead } from "@/components/core/page-title";
import { MuralModais, MuralRecadoCard, useMuralModais } from "@/components/mural";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useMuralActions, useMuralHistorico, useMuralRecado } from "@/hooks/use-mural";

const POR_PAGINA = 20;

const campoFiltro =
  "h-8 rounded border border-subtle bg-surface-2 px-2 text-12 text-primary outline-none focus:border-accent-primary";

function MuralPage() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { currentWorkspace } = useWorkspace();
  const { canPublish } = useMuralActions(slug);
  // `?recado=<id>` vem da notificação do sino: abre o recado direto.
  const recadoDoLink = useSearchParams().get("recado");
  const { data: recadoInicial } = useMuralRecado(slug, recadoDoLink);
  const modais = useMuralModais(recadoInicial);

  const [desde, setDesde] = useState("");
  const [ate, setAte] = useState("");
  const [isWithInativos, setIsWithInativos] = useState(false);
  const [pagina, setPagina] = useState(0);

  const { data, isLoading, error } = useMuralHistorico(slug, {
    desde,
    ate,
    inactive: canPublish && isWithInativos,
    perPage: POR_PAGINA,
    cursor: pagina ? `${POR_PAGINA}:${pagina}:0` : undefined,
  });

  const setFiltro = (aplicar: () => void) => {
    aplicar();
    setPagina(0);
  };

  const total = data?.total_count ?? 0;
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - Mural` : "Mural";

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <PageHead title={pageTitle} />

      <div className="flex items-center justify-between border-b border-subtle px-6 py-4">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-secondary" />
          <div>
            <h1 className="text-lg font-semibold">Mural</h1>
            <p className="text-13 text-secondary">
              {total} {total === 1 ? "recado" : "recados"}
            </p>
          </div>
        </div>
        {canPublish && (
          <button
            type="button"
            onClick={modais.onNew}
            className="inline-flex items-center gap-1.5 rounded bg-accent-primary px-3 py-2 text-13 font-medium text-white hover:bg-accent-primary/90"
          >
            <Plus className="h-4 w-4" />
            Novo recado
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-subtle px-6 py-3 text-12">
        <label className="flex items-center gap-1.5 text-secondary">
          De
          <input
            type="date"
            value={desde}
            onChange={(e) => setFiltro(() => setDesde(e.target.value))}
            className={campoFiltro}
          />
        </label>
        <label className="flex items-center gap-1.5 text-secondary">
          Até
          <input
            type="date"
            value={ate}
            onChange={(e) => setFiltro(() => setAte(e.target.value))}
            className={campoFiltro}
          />
        </label>
        {canPublish && (
          <label className="flex items-center gap-1.5 text-secondary">
            <input
              type="checkbox"
              checked={isWithInativos}
              onChange={(e) => setFiltro(() => setIsWithInativos(e.target.checked))}
            />
            Mostrar inativos
          </label>
        )}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-6">
        {error && (
          <p className="rounded border border-subtle bg-surface-2 px-4 py-3 text-13 text-secondary">
            Não foi possível carregar o mural. Tente de novo em instantes.
          </p>
        )}
        {isLoading && <div className="h-32 animate-pulse rounded-lg border border-subtle bg-surface-2" />}
        {!isLoading && !error && !data?.results.length && (
          <p className="py-10 text-center text-13 text-secondary">Nenhum recado no período.</p>
        )}
        {data?.results.map((recado) => (
          <MuralRecadoCard key={recado.id} recado={recado} onOpen={modais.onOpen} />
        ))}

        {(data?.prev_page_results || data?.next_page_results) && (
          <div className="flex items-center justify-end gap-2 pt-2 text-12 text-secondary">
            <button
              type="button"
              aria-label="Página anterior"
              disabled={!data?.prev_page_results}
              onClick={() => setPagina((p) => Math.max(0, p - 1))}
              className="rounded border border-subtle p-1 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span>Página {pagina + 1}</span>
            <button
              type="button"
              aria-label="Próxima página"
              disabled={!data?.next_page_results}
              onClick={() => setPagina((p) => p + 1)}
              className="rounded border border-subtle p-1 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <MuralModais workspaceSlug={slug} modais={modais} />
    </div>
  );
}

export default observer(MuralPage);
