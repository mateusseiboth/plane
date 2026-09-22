/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import Link from "next/link";
import { ArrowRight, Megaphone, Plus } from "lucide-react";
// hooks
import { useMuralActions, useMuralHome } from "@/hooks/use-mural";
// local imports
import { MuralModais, useMuralModais } from "./modais";
import { MuralRecadoCard } from "./recado-card";

type Props = { workspaceSlug: string };

/** Mural no topo da home: não lidos em destaque, fixados sempre visíveis. */
export function MuralHomeSection({ workspaceSlug }: Props) {
  const { data: recados, isLoading } = useMuralHome(workspaceSlug);
  const { canPublish } = useMuralActions(workspaceSlug);
  const modais = useMuralModais();

  if (isLoading) return <div className="mb-6 h-24 animate-pulse rounded-xl border border-subtle bg-surface-2" />;
  // Sem recado e sem quem publique, a seção só ocuparia espaço.
  if (!recados?.length && !canPublish) return null;

  const naoLidos = recados?.filter((r) => !r.is_read).length ?? 0;

  return (
    <section className="mb-6 rounded-xl border border-subtle bg-surface-1 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-secondary" />
          <span className="text-13 font-semibold">Mural</span>
          {naoLidos > 0 && (
            <span className="rounded-full bg-accent-primary/15 px-1.5 py-0.5 text-10 font-semibold text-accent-primary">
              {naoLidos} {naoLidos === 1 ? "novo" : "novos"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {canPublish && (
            <button
              type="button"
              onClick={modais.onNew}
              className="flex items-center gap-1 text-11 text-accent-primary hover:underline"
            >
              <Plus className="h-3 w-3" /> Novo recado
            </button>
          )}
          <Link
            href={`/${workspaceSlug}/mural/`}
            className="flex items-center gap-1 text-11 text-accent-primary hover:underline"
          >
            Ver todos <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {!recados?.length && <p className="py-3 text-center text-13 text-secondary">Nenhum recado no mural.</p>}
      <div className="space-y-2">
        {recados?.map((recado) => (
          <MuralRecadoCard key={recado.id} recado={recado} onOpen={modais.onOpen} />
        ))}
      </div>

      <MuralModais workspaceSlug={workspaceSlug} modais={modais} />
    </section>
  );
}
