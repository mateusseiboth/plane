/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import useSWR, { mutate as mutateGlobal } from "swr";
// services
import { IssueService } from "@/services/issue";
import {
  homePainelService,
  type TChamadosPorSistema,
  type TEventoDaHome,
  type TMetricasDoMes,
  type TPerfilDaHome,
  type TPeriodoDoPainel,
  type TSerieDeChamados,
  type TTarefaDaHome,
} from "@/services/home-painel.service";

const PREFIXO = "HOME_PAINEL_";

/** Troca de período mantém o gráfico anterior na tela até o novo chegar. */
const SWR_OPTIONS = { revalidateOnFocus: false, keepPreviousData: true } as const;

/** O que todo hook do painel expõe, no formato dos demais hooks de dados do web. */
function usePainelQuery<T>(chave: string | null, buscar: () => Promise<T>) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<T>(chave, chave ? buscar : null, SWR_OPTIONS);
  return { data, error, isLoading, isFetching: isValidating, refetch: mutate };
}

const buildChave = (slug: string | undefined, ...partes: string[]) =>
  slug ? [PREFIXO, slug, ...partes].join("_") : null;

/** Revalida o painel inteiro: concluir uma tarefa mexe na série, nas métricas e na atividade. */
export const refreshPainelDaHome = () => mutateGlobal((key) => typeof key === "string" && key.startsWith(PREFIXO));

export const useSerieDeChamados = (slug: string | undefined, periodo: TPeriodoDoPainel) =>
  usePainelQuery<TSerieDeChamados>(buildChave(slug, "SERIE", periodo), () => homePainelService.serie(slug!, periodo));

export const useTarefasDaHome = (slug: string | undefined) =>
  usePainelQuery<TTarefaDaHome[]>(buildChave(slug, "TAREFAS"), () => homePainelService.tarefas(slug!));

export const useMetricasDoMes = (slug: string | undefined) =>
  usePainelQuery<TMetricasDoMes>(buildChave(slug, "METRICAS"), () => homePainelService.metricasDoMes(slug!));

export const useChamadosPorSistema = (slug: string | undefined, periodo: TPeriodoDoPainel) =>
  usePainelQuery<TChamadosPorSistema>(buildChave(slug, "SISTEMAS", periodo), () =>
    homePainelService.chamadosPorSistema(slug!, periodo)
  );

export const usePerfilDaHome = (slug: string | undefined) =>
  usePainelQuery<TPerfilDaHome>(buildChave(slug, "PERFIL"), () => homePainelService.perfil(slug!));

export const useAtividadeDaHome = (slug: string | undefined) =>
  usePainelQuery<TEventoDaHome[]>(buildChave(slug, "ATIVIDADE"), () => homePainelService.atividade(slug!));

const issueService = new IssueService();

/**
 * Concluir uma tarefa é levar o chamado para a etapa de conclusão do sistema,
 * pela mesma rota do quadro: a regra de transição da função vale aqui também.
 */
export function useCompleteTarefa(slug: string | undefined) {
  const [idEmConclusao, setIdEmConclusao] = useState<string | null>(null);

  const completeTarefa = async (tarefa: TTarefaDaHome) => {
    if (!slug || !tarefa.completed_state_id) return;
    setIdEmConclusao(tarefa.id);
    try {
      await issueService.patchIssue(slug, tarefa.project_id, tarefa.id, { state_id: tarefa.completed_state_id });
      await refreshPainelDaHome();
    } finally {
      setIdEmConclusao(null);
    }
  };

  return { completeTarefa, idEmConclusao };
}
