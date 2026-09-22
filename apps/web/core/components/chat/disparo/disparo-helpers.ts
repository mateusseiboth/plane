/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Regras de tela do disparo em massa. Puro: sem React, sem rede.

import type { FiltrosDoEnvio, ResumoDoEnvio } from "@/services/disparo.service";

/** Chave da matriz de ações que libera a tela e o botão no atendimento. */
export const ACAO_DO_DISPARO = "chat.disparo";

export const ABAS_DO_DISPARO = [
  { key: "mensagens", label: "Mensagens" },
  { key: "enviar", label: "Enviar" },
  { key: "historico", label: "Histórico" },
  { key: "fila", label: "Fila Z-API" },
  { key: "configuracao", label: "Configuração" },
] as const;

export type AbaDoDisparo = (typeof ABAS_DO_DISPARO)[number]["key"];

const ROTULO_DO_ITEM: Record<string, string> = {
  pendente: "Na fila",
  processando: "Enviando",
  enviado: "Enviado",
  falhou: "Falhou",
  cancelado: "Cancelado",
};

const ROTULO_DO_ENVIO: Record<string, string> = {
  em_andamento: "Enviando",
  concluida: "Concluído",
  cancelada: "Cancelado",
};

export const statusDoItemLabel = (status: string): string => ROTULO_DO_ITEM[status] ?? status;

export const statusDoEnvioLabel = (status: string): string => ROTULO_DO_ENVIO[status] ?? status;

export const COR_DO_ITEM: Record<string, string> = {
  enviado: "text-success-primary",
  falhou: "text-danger-primary",
  cancelado: "text-tertiary",
};

export type EstadoDosFiltros = { entityType: number | null; entityId: string; projectId: string };

export const FILTROS_VAZIOS: EstadoDosFiltros = { entityType: null, entityId: "", projectId: "" };

export const buildFiltrosDoEnvio = (estado: EstadoDosFiltros): FiltrosDoEnvio => ({
  ...(estado.entityType !== null ? { entity_type: estado.entityType } : {}),
  ...(estado.entityId ? { entity_id: estado.entityId } : {}),
  ...(estado.projectId ? { project_id: estado.projectId } : {}),
});

type DadosDoFormulario = { titulo: string; texto: string; arquivo: File | null; removerArquivo: boolean };

export function buildFormDaMensagem({ titulo, texto, arquivo, removerArquivo }: DadosDoFormulario): FormData {
  const form = new FormData();
  form.append("titulo", titulo);
  form.append("texto", texto);
  if (arquivo) form.append("arquivo", arquivo);
  if (!arquivo && removerArquivo) form.append("remover_arquivo", "true");
  return form;
}

type NomesDosFiltros = {
  tipos: Record<number, string>;
  entidades: Record<string, string>;
  sistemas: Record<string, string>;
};

type FiltrosGravados = { entity_type?: number | null; entity_id?: string | null; project_id?: string | null };

export function describeFiltros(filtros: FiltrosGravados, nomes: NomesDosFiltros): string {
  const partes = [
    filtros.entity_type != null ? (nomes.tipos[filtros.entity_type] ?? `Tipo ${filtros.entity_type}`) : null,
    filtros.entity_id ? (nomes.entidades[filtros.entity_id] ?? "Entidade") : null,
    filtros.project_id ? (nomes.sistemas[filtros.project_id] ?? "Sistema") : null,
  ].filter((p): p is string => !!p);
  return partes.length ? partes.join(" · ") : "Todos os responsáveis";
}

/** Percentual do que já foi tentado (enviado, falhou ou cancelado). */
export function getProgresso(resumo: ResumoDoEnvio): number {
  if (!resumo.total) return 100;
  return Math.round(((resumo.total - resumo.pendente - resumo.processando) / resumo.total) * 100);
}

export const isImagem = (mime: string | null | undefined): boolean => !!mime && mime.startsWith("image/");
