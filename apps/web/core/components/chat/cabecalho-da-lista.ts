/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// A barra lateral do atendimento tem largura fixa (w-72): título + cinco ícones
// não cabem e o último saía cortado. Adicionar e Disparo ficam à vista; o que é
// de gestão vai para o menu "Mais ações", cada item pela sua ação do chat.
import type { PermissoesDoAtendimento } from "@/components/chat/permissoes-do-atendimento";

export const ACOES_DO_GESTOR = ["gerenciador", "dashboard", "configuracoes"] as const;

export type AcaoDoGestor = (typeof ACOES_DO_GESTOR)[number];

type PermissoesDoMenu = Pick<PermissoesDoAtendimento, "canVerTodas" | "canVerRelatorios" | "hasConfiguracao">;

const PERMISSAO_DO_ITEM: Record<AcaoDoGestor, (p: PermissoesDoMenu) => boolean> = {
  gerenciador: (p) => p.canVerTodas,
  dashboard: (p) => p.canVerRelatorios,
  configuracoes: (p) => p.hasConfiguracao,
};

export const findAcoesDoMenu = (permissoes: PermissoesDoMenu): readonly AcaoDoGestor[] =>
  ACOES_DO_GESTOR.filter((acao) => PERMISSAO_DO_ITEM[acao](permissoes));
