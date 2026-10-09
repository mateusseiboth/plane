/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { BarChart2, ListFilter, MoreHorizontal, Settings2, type LucideIcon } from "lucide-react";
// plane imports
import { CustomMenu } from "@plane/ui";
// local imports
import { findAcoesDoMenu, type AcaoDoGestor } from "@/components/chat/cabecalho-da-lista";
import type { PermissoesDoAtendimento } from "@/components/chat/permissoes-do-atendimento";

const ITEM_DO_MENU: Record<AcaoDoGestor, { rotulo: string; Icone: LucideIcon }> = {
  gerenciador: { rotulo: "Gerenciador de conversas", Icone: ListFilter },
  dashboard: { rotulo: "Dashboard de atendimento", Icone: BarChart2 },
  configuracoes: { rotulo: "Configurações do chat", Icone: Settings2 },
};

type Props = {
  permissoes: PermissoesDoAtendimento;
  onAcao: Record<AcaoDoGestor, () => void>;
};

/** Menu "Mais ações" do cabeçalho da lista de atendimentos (cada item pela sua ação do chat). */
export function MenuDoGestor({ permissoes, onAcao }: Props) {
  const acoes = findAcoesDoMenu(permissoes);
  if (!acoes.length) return null;
  return (
    <CustomMenu
      customButton={
        <span
          title="Mais ações"
          className="grid place-items-center rounded-md p-1.5 text-secondary transition-colors hover:bg-layer-2 hover:text-primary"
        >
          <MoreHorizontal className="h-4 w-4" />
        </span>
      }
      ariaLabel="Mais ações"
      placement="bottom-end"
      closeOnSelect
    >
      {acoes.map((acao) => {
        const { rotulo, Icone } = ITEM_DO_MENU[acao];
        return (
          <CustomMenu.MenuItem key={acao} onClick={onAcao[acao]} className="flex items-center gap-2">
            <Icone className="h-3.5 w-3.5 shrink-0" />
            {rotulo}
          </CustomMenu.MenuItem>
        );
      })}
    </CustomMenu>
  );
}
