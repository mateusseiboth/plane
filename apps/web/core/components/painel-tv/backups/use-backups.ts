/**
 * Ganchos do painel de backups interativo: os filtros (que vivem na URL, para o
 * painel poder ser compartilhado por link), o histórico de uma célula entidade
 * × sistema e o atalho para o plugin de backup, quando o espaço o tem.
 *
 * As regras puras ficam em `backups-helpers.ts`; aqui só há React e rede.
 */
import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { findPluginDeBackup, loadPainel, type ErroDoPainel } from "@/services/painel-tv.service";
import {
  buildBuscaDosFiltros,
  readFiltrosDaUrl,
  type FiltrosDoBackup,
  type THistoricoDeBackups,
} from "./backups-helpers";

/** A mesma janela que a rota aceita. */
const DIAS_MAXIMO = 30;

export type CelulaDoBackup = { entidadeId: string; entidade: string; sistema: number | null };

/**
 * Os filtros e a janela de dias, guardados na URL. `replaceState` em vez de
 * navegação: a TV não pode ganhar histórico de navegador a cada clique.
 */
export function useFiltrosDeBackup(diasDaUrl: number | null) {
  const [busca, setBusca] = useState(() => (typeof window === "undefined" ? "" : window.location.search));
  const [dias, setDias] = useState<number | null>(diasDaUrl);

  const filtros = useMemo(() => readFiltrosDaUrl(busca), [busca]);

  const gravar = useCallback((parciais: Partial<FiltrosDoBackup>, novosDias: number | null) => {
    const atual = typeof window === "undefined" ? "" : window.location.search;
    const nova = buildBuscaDosFiltros(atual, parciais, novosDias);
    if (typeof window !== "undefined")
      window.history.replaceState(null, "", nova ? `?${nova}` : window.location.pathname);
    setBusca(nova);
  }, []);

  const aplicar = useCallback((parciais: Partial<FiltrosDoBackup>) => gravar(parciais, dias), [gravar, dias]);

  const trocarDias = useCallback(
    (valor: number) => {
      const limitado = Math.min(Math.max(1, Math.floor(valor) || 1), DIAS_MAXIMO);
      setDias(limitado);
      gravar({}, limitado);
    },
    [gravar]
  );

  return { filtros, dias, aplicar, trocarDias };
}

/** O histórico da célula aberta. Só busca quando há célula escolhida. */
export function useHistoricoDeBackups(workspaceSlug: string, chave: string | null, celula: CelulaDoBackup | null) {
  const { data, error, isLoading } = useSWR<THistoricoDeBackups, ErroDoPainel>(
    celula ? ["PAINEL_TV_HISTORICO", workspaceSlug, celula.entidadeId, celula.sistema ?? "todos"] : null,
    () =>
      loadPainel<THistoricoDeBackups>(workspaceSlug, "/backups/historico/", {
        chave,
        params: { entidade: celula!.entidadeId, sistema: celula!.sistema, dias: 180 },
      }),
    { revalidateOnFocus: false }
  );

  return { historico: data, error, isLoading };
}

/** O plugin de backup do espaço, quando quem está olhando pode vê-lo. */
export function usePluginDeBackup(logado: boolean) {
  const { data } = useSWR(logado ? "PAINEL_TV_PLUGIN_BACKUP" : null, findPluginDeBackup, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });
  return data ?? null;
}
