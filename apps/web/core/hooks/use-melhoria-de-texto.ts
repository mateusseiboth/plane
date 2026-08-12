/**
 * A proposta da IA para o texto que está no editor — Parte 3 do contrato em
 * `.claude/CONTRATO_IA_REQUISITOS.md`.
 *
 * Como a análise ao salvar, esta consulta é uma **ação**: nasce do clique em
 * "Melhorar com IA". Daí `useSWRMutation` (`trigger`/`isMutating`/`reset`) em
 * vez de `useSWR` — a mesma biblioteca do resto do app, o lado dela que existe
 * para mutação disparada por gente.
 *
 * Diferença de propósito em relação aos irmãos `useSugestaoDeRequisito` e
 * `useAnaliseDeChamado`: ali a IA falha calada, porque escrever chamado não pode
 * depender dela. Aqui alguém clicou e está esperando — a falha **sobe**, e quem
 * chamou a transforma em recado. Silêncio, neste caso, seria o defeito que a
 * Parte 3 veio corrigir.
 */
import { useCallback, useMemo } from "react";
import useSWRMutation from "swr/mutation";
// services
import type { TAlvoDaMelhoria, TContextoDaMelhoria, TMelhoriaDeTexto } from "@/services/ai.service";
import { AIService } from "@/services/ai.service";

const aiService = new AIService();

export const MELHORIA_DE_TEXTO_KEY = (workspaceSlug: string, campo: string, alvo: string) =>
  `MELHORIA_DE_TEXTO_${workspaceSlug}_${campo}_${alvo}`;

type TParametros = {
  workspaceSlug: string | undefined;
  /** O que a tela sabe do chamado; o servidor completa pelo banco. */
  contexto?: TContextoDaMelhoria;
  alvo?: TAlvoDaMelhoria;
};

export const useMelhoriaDeTexto = (params: TParametros) => {
  const { workspaceSlug, contexto, alvo } = params;

  const chave = workspaceSlug
    ? MELHORIA_DE_TEXTO_KEY(workspaceSlug, alvo?.campo ?? "texto", alvo?.issue_id ?? alvo?.project_id ?? "")
    : null;

  const {
    data,
    error,
    isMutating,
    trigger,
    reset: descartar,
  } = useSWRMutation(chave, (_chave: string, { arg }: { arg: string }) =>
    aiService.improveText(workspaceSlug ?? "", arg, contexto, alvo)
  );

  /** Rejeita quando o provedor falha: quem clicou merece saber. */
  const pedir = useCallback(
    async (html: string): Promise<TMelhoriaDeTexto | undefined> => {
      if (!chave) return undefined;
      return await trigger(html);
    },
    [chave, trigger]
  );

  return useMemo(
    () => ({
      melhoria: data ?? null,
      /** Botão em "Melhorando…" enquanto a IA responde. */
      melhorando: isMutating,
      pedir,
      descartar,
      error,
    }),
    [data, isMutating, pedir, descartar, error]
  );
};
