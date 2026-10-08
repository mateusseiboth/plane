/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/** Campo da etapa no contrato de erro da API (`errors: [{ path, message }]`). */
export const STATE_FIELD = "state_id";

/**
 * Repassa ao seletor de etapa só a recusa do campo dele. A API exige um
 * comentário antes de mudar a etapa e devolve o motivo neste campo.
 */
export const buildStateFieldErrorHandler =
  (setMensagem: (mensagem: string) => void) =>
  (path: string, mensagem: string): void => {
    if (path !== STATE_FIELD) return;
    setMensagem(mensagem);
  };
