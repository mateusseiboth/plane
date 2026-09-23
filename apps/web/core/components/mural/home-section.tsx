/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import Link from "next/link";
import { ArrowRight, Megaphone, Plus } from "lucide-react";
// components
import { CartaoDoPainel, EsqueletoDoCartao, VazioDoCartao } from "@/components/home/painel/cartao";
// hooks
import { useMuralActions, useMuralHome } from "@/hooks/use-mural";
// local imports
import { MuralModais, useMuralModais } from "./modais";
import { MuralRecadoCard } from "./recado-card";

type Props = { workspaceSlug: string };

/** Quantos recados cabem no cartão da home; o resto fica no mural. */
const RECADOS_NA_HOME = 3;

const LINK =
  "flex items-center gap-1 rounded text-12 text-accent-primary hover:underline focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:outline-none";

/** Mural na home: os três primeiros da fila do mural (não lidos e fixados antes) e o link para o resto. */
export function MuralHomeSection({ workspaceSlug }: Props) {
  const { data: recados, isLoading } = useMuralHome(workspaceSlug);
  const { canPublish } = useMuralActions(workspaceSlug);
  const modais = useMuralModais();

  // Sem recado e sem quem publique, o cartão só ocuparia espaço.
  if (!isLoading && !recados?.length && !canPublish) return null;

  const naoLidos = recados?.filter((r) => !r.is_read).length ?? 0;

  const conteudo = () => {
    if (isLoading) return <EsqueletoDoCartao linhas={3} />;
    if (!recados?.length) return <VazioDoCartao icone={Megaphone} titulo="Nenhum recado no mural" />;
    return (
      <div className="flex flex-col gap-2">
        {recados.slice(0, RECADOS_NA_HOME).map((recado) => (
          <MuralRecadoCard key={recado.id} recado={recado} onOpen={modais.onOpen} />
        ))}
      </div>
    );
  };

  return (
    <CartaoDoPainel
      titulo="Mural de recados"
      subtitulo={naoLidos > 0 ? `${naoLidos} ${naoLidos === 1 ? "recado novo" : "recados novos"}` : "Recados do espaço"}
      acao={
        <div className="flex items-center gap-3">
          {canPublish && (
            <button type="button" onClick={modais.onNew} className={LINK}>
              <Plus aria-hidden className="size-3" /> Novo recado
            </button>
          )}
          <Link href={`/${workspaceSlug}/mural/`} className={LINK}>
            Ver mural <ArrowRight aria-hidden className="size-3" />
          </Link>
        </div>
      }
    >
      {conteudo()}
      <MuralModais workspaceSlug={workspaceSlug} modais={modais} />
    </CartaoDoPainel>
  );
}
