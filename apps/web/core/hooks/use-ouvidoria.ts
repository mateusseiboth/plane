/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR, { mutate as mutateGlobal } from "swr";
// components
import {
  ACOES,
  buildContatoEmailQuery,
  buildCurriculoQuery,
  buildOuvidoriaQuery,
  isOuvidoriaEvent,
  type TContatoEmailFiltros,
  type TCurriculoFiltros,
  type TOuvidoriaFiltros,
} from "@/components/ouvidoria/helpers";
// hooks
import { useRealtimeRefetch } from "@/hooks/use-realtime";
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";
// services
import ouvidoriaService, {
  type TCurriculoMarcacao,
  type TDenunciaPayload,
  type TListaDeEmails,
} from "@/services/ouvidoria.service";

const OPCOES = { revalidateOnFocus: false, keepPreviousData: true } as const;

const refreshPorPrefixo = (prefixo: string) =>
  mutateGlobal((key) => typeof key === "string" && key.startsWith(prefixo));

/** O que quem está logado pode fazer nestas telas (matriz de ações). */
export function useOuvidoriaPermissoes(slug: string | undefined) {
  const { can, isLoading } = useMyWorkspaceActions(slug);
  return {
    isLoading,
    canReadOuvidoria: can(ACOES.OUVIDORIA_READ),
    canReadDenuncias: can(ACOES.DENUNCIA_READ),
    canReadCurriculos: can(ACOES.CURRICULO_READ),
    canExportContatos: can(ACOES.CONTATO_EXPORT),
  };
}

// ── Ouvidoria ────────────────────────────────────────────────────────────────

const OUVIDORIA = "OUVIDORIA_";

export function useOuvidoria(slug: string | undefined, filtros: TOuvidoriaFiltros, enabled: boolean) {
  const query = buildOuvidoriaQuery(filtros);
  useRealtimeRefetch(isOuvidoriaEvent, () => void refreshPorPrefixo(OUVIDORIA));
  const isPronto = !!slug && enabled;
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    isPronto ? `${OUVIDORIA}LISTA_${slug}_${query}` : null,
    isPronto ? () => ouvidoriaService.listOuvidoria(slug, query) : null,
    OPCOES
  );
  const markLida = async (id: string) => {
    const lida = await ouvidoriaService.markOuvidoriaLida(slug ?? "", id);
    await refreshPorPrefixo(OUVIDORIA);
    return lida;
  };
  return { data, error, isLoading, isFetching: isValidating, refetch: mutate, markLida };
}

/** Contador do menu. Só pergunta à API quando a pessoa pode ler a ouvidoria. */
export function useOuvidoriaNaoLidas(slug: string | undefined, enabled: boolean) {
  useRealtimeRefetch(isOuvidoriaEvent, () => void refreshPorPrefixo(OUVIDORIA));
  const isPronto = !!slug && enabled;
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    isPronto ? `${OUVIDORIA}NAO_LIDAS_${slug}` : null,
    isPronto ? () => ouvidoriaService.countOuvidoriaNaoLidas(slug) : null,
    { revalidateOnFocus: true, refreshInterval: 5 * 60_000 }
  );
  return { count: data?.count ?? 0, data, error, isLoading, isFetching: isValidating, refetch: mutate };
}

// ── Denúncia ─────────────────────────────────────────────────────────────────

const DENUNCIAS = "DENUNCIAS_";

export function useDenuncias(slug: string | undefined, cursor: string | undefined, enabled: boolean) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const isPronto = !!slug && enabled;
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    isPronto ? `${DENUNCIAS}${slug}_${query}` : null,
    isPronto ? () => ouvidoriaService.listDenuncias(slug, query) : null,
    OPCOES
  );
  const create = async (payload: TDenunciaPayload) => {
    const criada = await ouvidoriaService.createDenuncia(slug ?? "", payload);
    await refreshPorPrefixo(DENUNCIAS);
    return criada;
  };
  return { data, error, isLoading, isFetching: isValidating, refetch: mutate, create };
}

// ── Currículos ───────────────────────────────────────────────────────────────

const CURRICULOS = "CURRICULOS_";

export function useCurriculos(slug: string | undefined, filtros: TCurriculoFiltros, enabled: boolean) {
  const query = buildCurriculoQuery(filtros);
  const isPronto = !!slug && enabled;
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    isPronto ? `${CURRICULOS}LISTA_${slug}_${query}` : null,
    isPronto ? () => ouvidoriaService.listCurriculos(slug, query) : null,
    OPCOES
  );
  const withRefresh =
    <A extends unknown[], R>(run: (...args: A) => Promise<R>) =>
    async (...args: A) => {
      const r = await run(...args);
      await refreshPorPrefixo(CURRICULOS);
      return r;
    };
  return {
    data,
    error,
    isLoading,
    isFetching: isValidating,
    refetch: mutate,
    mark: withRefresh((id: string, marcacao: TCurriculoMarcacao) =>
      ouvidoriaService.markCurriculo(slug ?? "", id, marcacao)
    ),
    remove: withRefresh((id: string) => ouvidoriaService.removeCurriculo(slug ?? "", id)),
    getDownloadUrl: (id: string) => ouvidoriaService.getCurriculoDownloadUrl(slug ?? "", id),
  };
}

export function useVagas(slug: string | undefined, enabled: boolean) {
  const isPronto = !!slug && enabled;
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    isPronto ? `${CURRICULOS}VAGAS_${slug}` : null,
    isPronto ? () => ouvidoriaService.listVagas(slug) : null,
    OPCOES
  );
  return { vagas: data ?? [], data, error, isLoading, isFetching: isValidating, refetch: mutate };
}

export function useRetencaoDeCurriculos(slug: string | undefined, enabled: boolean) {
  const isPronto = !!slug && enabled;
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    isPronto ? `${CURRICULOS}RETENCAO_${slug}` : null,
    isPronto ? () => ouvidoriaService.readRetencao(slug) : null,
    OPCOES
  );
  const save = async (dias: number) => {
    const salvo = await ouvidoriaService.saveRetencao(slug ?? "", dias);
    await mutate(salvo, { revalidate: false });
    return salvo;
  };
  return { data, error, isLoading, isFetching: isValidating, refetch: mutate, save };
}

// ── Lista de e-mails dos responsáveis ───────────────────────────────────────

/**
 * A lista só é gerada quando a pessoa pede (`gerada`): cada geração é uma
 * exportação de dado pessoal e entra na auditoria.
 */
export function useListaDeEmails(slug: string | undefined, gerada: TContatoEmailFiltros | null) {
  const query = gerada ? buildContatoEmailQuery(gerada) : "";
  const isPronto = !!slug && !!gerada;
  const { data, error, isLoading, isValidating, mutate } = useSWR<TListaDeEmails>(
    isPronto ? `CONTATO_EMAILS_${slug}_${query}` : null,
    isPronto ? () => ouvidoriaService.findListaDeEmails(slug, query) : null,
    { revalidateOnFocus: false, revalidateIfStale: false }
  );
  return {
    data,
    error,
    isLoading,
    isFetching: isValidating,
    refetch: mutate,
    csvUrl: slug && gerada ? ouvidoriaService.getListaDeEmailsCsvUrl(slug, query) : null,
  };
}
