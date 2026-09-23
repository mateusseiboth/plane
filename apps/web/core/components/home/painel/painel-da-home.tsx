/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// components
import { MuralHomeSection } from "@/components/mural/home-section";
// hooks
import { refreshPainelDaHome } from "@/hooks/use-home-painel";
import { useRealtimeRefetch } from "@/hooks/use-realtime";
// local imports
import { AtividadeDaHome } from "./atividade";
import { ChamadosPorSistema } from "./chamados-por-sistema";
import { AcessoDaPessoa, DetalhesDaPessoa } from "./detalhes";
import { isEventoDoPainel } from "./painel-rules";
import { PerfilDaHome } from "./perfil";
import { SerieDeChamados } from "./serie-de-chamados";
import { TarefasDaHome } from "./tarefas";

type Props = { workspaceSlug: string; userId: string };

/**
 * Painel da home em duas colunas: à esquerda o trabalho (série, tarefas, mural
 * e atividade), à direita a pessoa. Em tela estreita a coluna da pessoa desce
 * para depois do conteúdo principal.
 */
export function PainelDaHome({ workspaceSlug, userId }: Props) {
  useRealtimeRefetch(
    (evento) => isEventoDoPainel(evento, userId),
    () => void refreshPainelDaHome(),
    1500
  );

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        <SerieDeChamados workspaceSlug={workspaceSlug} />
        <TarefasDaHome workspaceSlug={workspaceSlug} />
        <MuralHomeSection workspaceSlug={workspaceSlug} />
        <AtividadeDaHome workspaceSlug={workspaceSlug} />
      </div>
      <aside aria-label="Você no espaço" className="flex min-w-0 flex-col gap-5">
        <PerfilDaHome workspaceSlug={workspaceSlug} />
        <ChamadosPorSistema workspaceSlug={workspaceSlug} />
        <DetalhesDaPessoa workspaceSlug={workspaceSlug} />
        <AcessoDaPessoa workspaceSlug={workspaceSlug} />
      </aside>
    </div>
  );
}
