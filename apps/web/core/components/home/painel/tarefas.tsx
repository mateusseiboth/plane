/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import Link from "next/link";
import { ArrowRight, CalendarCheck } from "lucide-react";
import { cn } from "@plane/utils";
// hooks
import { useCompleteTarefa, useTarefasDaHome } from "@/hooks/use-home-painel";
// local imports
import { CartaoDoPainel, EsqueletoDoCartao, VazioDoCartao } from "./cartao";
import { groupTarefasPorPrazo } from "./painel-rules";
import type { TChaveDoPrazo } from "./painel-rules";
import { TarefaLinha } from "./tarefa-linha";

/** Tom do título de cada grupo: só "Atrasados" chama atenção. */
const TOM_DO_GRUPO: Record<TChaveDoPrazo, string> = {
  hoje: "text-secondary",
  amanha: "text-secondary",
  esta_semana: "text-secondary",
  depois: "text-secondary",
  atrasados: "text-danger-primary",
};

export function TarefasDaHome({ workspaceSlug }: { workspaceSlug: string }) {
  const { data: tarefas, isLoading, isFetching } = useTarefasDaHome(workspaceSlug);
  const { completeTarefa, idEmConclusao } = useCompleteTarefa(workspaceSlug);
  const agora = new Date();
  const grupos = groupTarefasPorPrazo(tarefas ?? [], agora);

  const conteudo = () => {
    if (isLoading) return <EsqueletoDoCartao linhas={5} />;
    if (!grupos.length)
      return (
        <VazioDoCartao
          icone={CalendarCheck}
          titulo="Nenhum chamado com prazo"
          detalhe="Os chamados com prazo em que você é responsável aparecem aqui."
        />
      );
    return (
      <div className="flex flex-col gap-4">
        {grupos.map((grupo) => (
          <section key={grupo.chave} aria-label={grupo.rotulo}>
            <h3 className={cn("mb-1 flex items-center gap-2 px-2 text-12 font-semibold", TOM_DO_GRUPO[grupo.chave])}>
              {grupo.rotulo}
              <span className="rounded-full bg-layer-1 px-1.5 text-11 font-medium text-tertiary dark:bg-layer-2">
                {grupo.tarefas.length}
              </span>
            </h3>
            <ul className="flex flex-col">
              {grupo.tarefas.map((tarefa) => (
                <TarefaLinha
                  key={tarefa.id}
                  tarefa={tarefa}
                  workspaceSlug={workspaceSlug}
                  agora={agora}
                  isAtrasada={grupo.chave === "atrasados"}
                  isConcluindo={idEmConclusao === tarefa.id}
                  onComplete={completeTarefa}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  };

  return (
    <CartaoDoPainel
      titulo="Tarefas"
      subtitulo="Seus chamados abertos com prazo"
      isAtualizando={isFetching && !isLoading}
      acao={
        <Link
          href={`/${workspaceSlug}/workspace-views/assigned/`}
          className="flex items-center gap-1 rounded text-12 text-accent-primary hover:underline focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:outline-none"
        >
          Ver todos <ArrowRight aria-hidden className="size-3" />
        </Link>
      }
    >
      {conteudo()}
    </CartaoDoPainel>
  );
}
