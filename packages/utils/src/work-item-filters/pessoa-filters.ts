/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Decisão dos atalhos de pessoa: **Meus chamados** (`assignee_id`) e
 * **Abertos por mim** (`created_by_id`).
 *
 * Os dois ligam/desligam o usuário atual numa condição **sem apagar o resto do
 * filtro** — é o que permite combinar "chamados do meu setor" com "só os meus".
 * A regra tem cantos que quebram a listagem em silêncio (uma condição com lista
 * vazia devolve zero chamados, não "sem filtro"), então ela vive aqui, longe do
 * React, e é testada.
 */

/** Propriedades que os atalhos manipulam. */
export const PESSOA_FILTER_PROPERTY = {
  ASSIGNEE: "assignee_id",
  CREATED_BY: "created_by_id",
} as const;

export type TPessoaFilterProperty = (typeof PESSOA_FILTER_PROPERTY)[keyof typeof PESSOA_FILTER_PROPERTY];

/** O que o componente deve fazer com a condição. */
export type TPessoaFilterAction =
  | { type: "add"; values: string[] }
  | { type: "update"; values: string[] }
  | { type: "remove" }
  | { type: "noop" };

export const toPessoaList = (value: unknown): string[] => {
  // `String(undefined)` vira "undefined" (verdadeiro): descartar ANTES de converter.
  if (Array.isArray(value)) return value.filter((v) => v !== undefined && v !== null && v !== "").map(String);
  if (value === undefined || value === null || value === "") return [];
  return [String(value)];
};

export const isCurrentUserSelected = (values: string[], currentUserId: string | undefined): boolean =>
  !!currentUserId && values.includes(currentUserId);

/**
 * @param values Pessoas já filtradas (vazio quando não há condição).
 * @param hasCondition Se a condição existe no filtro.
 */
export const resolvePessoaFilterAction = (
  values: string[],
  currentUserId: string | undefined,
  hasCondition: boolean
): TPessoaFilterAction => {
  if (!currentUserId) return { type: "noop" };

  if (!hasCondition) return { type: "add", values: [currentUserId] };

  if (!isCurrentUserSelected(values, currentUserId)) {
    return { type: "update", values: [...values, currentUserId] };
  }

  const restante = values.filter((id) => id !== currentUserId);
  // Condição vazia não é "sem filtro": a listagem devolveria zero chamados.
  return restante.length === 0 ? { type: "remove" } : { type: "update", values: restante };
};

// Nomes antigos, mantidos porque a versão anterior só tratava responsáveis.
export const toAssigneeList = toPessoaList;
export const isAssignedToCurrentUser = isCurrentUserSelected;
export const resolveMyWorkItemsAction = resolvePessoaFilterAction;
