/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// A barra lateral do atendimento tem largura fixa (w-72): título + cinco ícones
// não cabem e o último saía cortado. Adicionar e Disparo ficam à vista; o que é
// de gestor vai para o menu "Mais ações".
export const ACOES_DO_GESTOR = ["gerenciador", "dashboard", "configuracoes"] as const;

export type AcaoDoGestor = (typeof ACOES_DO_GESTOR)[number];

const SEM_ACOES: readonly AcaoDoGestor[] = [];

export const findAcoesDoMenu = (isManager: boolean): readonly AcaoDoGestor[] =>
  isManager ? ACOES_DO_GESTOR : SEM_ACOES;
