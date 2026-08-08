/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { PenLine, UserRound } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { IWorkItemFilterInstance } from "@plane/shared-state";
import { Tooltip } from "@plane/ui";
import { PESSOA_FILTER_PROPERTY, type TPessoaFilterProperty } from "@plane/utils";
import { cn } from "@plane/utils";
// hooks
import { usePessoaFilter } from "@/hooks/work-item-filters/use-pessoa-filter";

type TPessoaToggleProps = {
  filter: IWorkItemFilterInstance | undefined;
};

const BUTTON_CLASSNAME =
  "flex h-7 items-center gap-1 rounded-md border border-subtle-1 px-2 py-0.5 text-12 text-secondary transition-all duration-200 cursor-pointer hover:bg-layer-1";

const ACTIVE_BUTTON_CLASSNAME =
  "border-accent-subtle-1 bg-accent-subtle text-accent-primary hover:bg-accent-subtle-hover";

type TAtalho = {
  property: TPessoaFilterProperty;
  icon: typeof UserRound;
  i18nKey: string;
};

const ATALHO: Record<"assignee" | "createdBy", TAtalho> = {
  assignee: { property: PESSOA_FILTER_PROPERTY.ASSIGNEE, icon: UserRound, i18nKey: "common.my_work_items_filter" },
  createdBy: { property: PESSOA_FILTER_PROPERTY.CREATED_BY, icon: PenLine, i18nKey: "common.opened_by_me_filter" },
};

function PessoaToggle({ filter, atalho }: TPessoaToggleProps & { atalho: TAtalho }) {
  const { t } = useTranslation();
  const { isAvailable, isActive, toggle } = usePessoaFilter(filter, atalho.property);

  if (!isAvailable) return null;

  const rotulo = t(`${atalho.i18nKey}.label`);
  const Icone = atalho.icon;

  return (
    <Tooltip tooltipContent={t(`${atalho.i18nKey}.tooltip`)} position="bottom">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={isActive}
        // O rótulo some em tela estreita, então o nome do botão tem de vir daqui:
        // sem isto o mobile fica com dois botões de ícone sem nome nenhum.
        aria-label={rotulo}
        className={cn(BUTTON_CLASSNAME, "px-1.5 @4xl:px-2", { [ACTIVE_BUTTON_CLASSNAME]: isActive })}
      >
        <Icone className="size-4 flex-shrink-0" />
        {/* Em tela estreita a barra já disputa espaço com layout, modelos,
            exibição e o botão de novo chamado: fica só o ícone. */}
        <span className="hidden whitespace-nowrap @4xl:inline">{rotulo}</span>
      </button>
    </Tooltip>
  );
}

/**
 * Atalhos "Meus chamados" e "Abertos por mim", lado a lado.
 *
 * Ficam junto do `FiltersToggle`, montado por TODAS as telas de listagem
 * (chamados do sistema, ciclo, módulo, visualizações, visões globais,
 * arquivados e perfil) — um único ponto e os dois aparecem em todas.
 *
 * São complementares: a Qualidade e o Atendimento abrem muito chamado que
 * depois fica com outra pessoa, então "abertos por mim" responde a uma pergunta
 * que "meus chamados" não responde.
 */
export const PessoaFilterToggles = observer(function PessoaFilterToggles(props: TPessoaToggleProps) {
  return (
    <>
      <PessoaToggle {...props} atalho={ATALHO.assignee} />
      <PessoaToggle {...props} atalho={ATALHO.createdBy} />
    </>
  );
});
