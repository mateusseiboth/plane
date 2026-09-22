/**
 * Dados do pós-atendimento via SWR. A tela não chama o serviço para ler: usa estes
 * hooks e, depois de gravar, `refreshPosAtendimento()` revalida fila, painel e relatório.
 */
import useSWR, { mutate as mutateGlobal } from "swr";
import { POS_ACTIONS, buildPosFilaParams, buildSatisfacaoParams } from "@/components/pos-atendimento/helpers";
import type { TPosFiltros, TPosOrigem, TPosPagina, TPosPainel, TSatisfacao } from "@/components/pos-atendimento/types";
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";
import { posAtendimentoService } from "@/services/pos-atendimento.service";

const PREFIXO = "POS_ATENDIMENTO";

export const POS_POR_PAGINA = 25;

const SWR_OPTIONS = { revalidateOnFocus: false, keepPreviousData: true } as const;

const isChaveDoPos = (key: unknown) => Array.isArray(key) && key[0] === PREFIXO;

/** Revalida tudo do pós-atendimento (fila, painéis, relatório) depois de uma escrita. */
export const refreshPosAtendimento = () => mutateGlobal(isChaveDoPos);

/** `posatendimento.record` registra, `.verify` verifica, `report.view` abre o relatório. */
export function usePosPermissions(workspaceSlug: string | undefined) {
  const { can, isLoading } = useMyWorkspaceActions(workspaceSlug);
  const canRecord = can(POS_ACTIONS.RECORD);
  const canVerify = can(POS_ACTIONS.VERIFY);
  return { canRecord, canVerify, canUseFila: canRecord || canVerify, canReport: can(POS_ACTIONS.REPORT), isLoading };
}

export function usePosFila(workspaceSlug: string | undefined, filtros: TPosFiltros, pagina: number, enabled: boolean) {
  const params = buildPosFilaParams(filtros, pagina, POS_POR_PAGINA);
  const { data, error, isLoading, isValidating, mutate } = useSWR<TPosPagina>(
    workspaceSlug && enabled ? [PREFIXO, "FILA", workspaceSlug, JSON.stringify(params)] : null,
    () => posAtendimentoService.list(workspaceSlug!, params),
    SWR_OPTIONS
  );
  return { data, error, isLoading, isFetching: isValidating, refetch: mutate };
}

/**
 * Painel do detalhe. `versao` entra na chave (ex.: a etapa do chamado) para o
 * painel reler quando o chamado é concluído.
 */
export function usePosPainel(
  workspaceSlug: string | undefined,
  origem: TPosOrigem,
  alvoId: string | undefined,
  versao?: string | number | null
) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<TPosPainel>(
    workspaceSlug && alvoId ? [PREFIXO, "PAINEL", workspaceSlug, origem, alvoId, versao ?? ""] : null,
    () => posAtendimentoService.painel(workspaceSlug!, origem, alvoId!),
    { revalidateOnFocus: false }
  );
  return { data, error, isLoading, isFetching: isValidating, refetch: mutate };
}

export function useSatisfacao(workspaceSlug: string | undefined, filtros: TPosFiltros, enabled: boolean) {
  const params = buildSatisfacaoParams(filtros);
  const { data, error, isLoading, isValidating, mutate } = useSWR<TSatisfacao>(
    workspaceSlug && enabled ? [PREFIXO, "SATISFACAO", workspaceSlug, JSON.stringify(params)] : null,
    () => posAtendimentoService.satisfacao(workspaceSlug!, params),
    SWR_OPTIONS
  );
  return { data, error, isLoading, isFetching: isValidating, refetch: mutate };
}

/** Lista por nota (`classificacao` = "3", "2", "1" ou "none"). Até 1000, para caber na impressão. */
export function useSatisfacaoItens(
  workspaceSlug: string | undefined,
  filtros: TPosFiltros,
  classificacao: string | null,
  enabled: boolean
) {
  const params = { ...buildSatisfacaoParams(filtros), per_page: "1000", ...(classificacao ? { classificacao } : {}) };
  const { data, error, isLoading, isValidating, mutate } = useSWR<TPosPagina>(
    workspaceSlug && enabled ? [PREFIXO, "SATISFACAO_ITENS", workspaceSlug, JSON.stringify(params)] : null,
    () => posAtendimentoService.satisfacaoItens(workspaceSlug!, params),
    SWR_OPTIONS
  );
  return { data, error, isLoading, isFetching: isValidating, refetch: mutate };
}
