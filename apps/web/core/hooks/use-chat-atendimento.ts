/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
import type { IModule } from "@plane/types";
// services
import { chatApi, type FiltroDeAtendimentos } from "@/services/chat.service";
import { ModuleService } from "@/services/module.service";

const moduleService = new ModuleService();

const OPCOES = { revalidateOnFocus: false } as const;

/** Catálogo de tipos de motivo do encerramento (config do chat). */
export const useChatMotivos = (apiUrl: string | undefined, slug: string) => {
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    apiUrl && slug ? ["CHAT_MOTIVOS", apiUrl, slug] : null,
    () => chatApi(apiUrl!).closeReasons(slug),
    OPCOES
  );
  return { motivos: data?.results ?? [], data, error, isLoading, isFetching: isValidating, refetch: mutate };
};

/** Módulos do sistema: a "funcionalidade" do encerramento e do chamado. */
export const useModulosDoSistema = (slug: string, projectId: string | null | undefined) => {
  const { data, error, isLoading, isValidating, mutate } = useSWR<IModule[]>(
    slug && projectId ? ["MODULOS_DO_SISTEMA", slug, projectId] : null,
    () => moduleService.getModules(slug, projectId!),
    OPCOES
  );
  const ativos = (data ?? []).filter((m) => !m.archived_at);
  return {
    modulos: ativos.map((m) => ({ value: m.id, label: m.name })),
    data,
    error,
    isLoading,
    isFetching: isValidating,
    refetch: mutate,
  };
};

export const useRelatorioDeAtendimentos = (apiUrl: string, slug: string, filtro: FiltroDeAtendimentos) => {
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ["CHAT_RELATORIO_ATENDIMENTOS", apiUrl, slug, JSON.stringify(filtro)],
    () => chatApi(apiUrl).relatorioDeAtendimentos(slug, filtro),
    OPCOES
  );
  return { relatorio: data, data, error, isLoading, isFetching: isValidating, refetch: mutate };
};

export const useRegistrosDeAtendimento = (apiUrl: string, slug: string, filtro: FiltroDeAtendimentos) => {
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ["CHAT_REGISTROS", apiUrl, slug, JSON.stringify(filtro)],
    () => chatApi(apiUrl).registros(slug, filtro),
    OPCOES
  );
  return { registros: data?.results ?? [], data, error, isLoading, isFetching: isValidating, refetch: mutate };
};
