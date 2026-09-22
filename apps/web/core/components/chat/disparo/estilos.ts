/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { ErroDoDisparo } from "@/services/disparo.service";

// Classes das abas do disparo, no mesmo visual da configuração do chat.
export const CAIXA =
  "w-full rounded-md border border-subtle bg-surface-1 px-2 py-1.5 text-sm text-primary outline-none";
export const BOTAO = "rounded-md bg-primary px-3 py-1.5 text-13 text-on-color disabled:opacity-50";
export const BOTAO_SECUNDARIO =
  "rounded-md border border-subtle px-3 py-1.5 text-13 text-secondary hover:bg-layer-1 disabled:opacity-50";
export const ROTULO = "mb-1 block text-12 text-secondary";
export const ERRO_DO_CAMPO = "mt-1 text-11 text-danger-primary";
export const TABELA = "w-full text-left text-13";
export const CABECALHO = "border-b border-subtle text-12 text-tertiary";
export const CELULA = "px-3 py-2";

export const toastErro = (e: unknown, padrao: string) =>
  setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: (e as ErroDoDisparo)?.detail || padrao });

export const toastSucesso = (message: string) => setToast({ type: TOAST_TYPE.SUCCESS, title: "Pronto", message });

export const formatDataHora = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";
