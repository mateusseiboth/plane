/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/** Erro de escrita da API: `detail` para o aviso e `errors` para os campos. */
export type TApiError = {
  detail?: string;
  errors?: { path: string; message: string }[];
};

type TSetFieldError = (path: string, message: string) => void;

/**
 * Coloca cada erro da API no campo de mesmo nome e devolve a mensagem geral
 * para o aviso. O campo recusado pode estar fora da vista; o aviso diz o que
 * aconteceu e o campo diz onde.
 */
export function applyApiFieldErrors(error: unknown, setFieldError: TSetFieldError, fallback: string): string {
  const apiError = (error ?? {}) as TApiError;
  for (const item of apiError.errors ?? []) setFieldError(item.path, item.message);
  return apiError.detail || fallback;
}
