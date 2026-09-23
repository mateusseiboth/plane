/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import Link from "next/link";
import { ArrowDown, ArrowUp, RotateCcw, X } from "lucide-react";
import { EModalWidth, ModalCore, ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import {
  ROTULO_DO_TAMANHO,
  TAMANHOS_DE_WIDGET,
  isTamanhoDeWidget,
  moveWidgetBy,
  setLigado,
  setTamanho,
} from "@/components/home/grade/grade-rules";
import type { TItemDaGrade } from "@/components/home/grade/grade-rules";
import type { TWidgetDaHome } from "@/components/home/grade/tipos";
// hooks
import { useHome } from "@/hooks/store/use-home";
import { useGradeDaHome } from "@/hooks/use-grade-da-home";
import type { TGradeDaHome } from "@/hooks/use-grade-da-home";

const BOTAO_DE_ICONE =
  "flex size-7 items-center justify-center rounded-md text-secondary hover:bg-layer-1 hover:text-primary disabled:pointer-events-none disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:outline-none";

type TLinhaProps = {
  widget: TWidgetDaHome;
  item: TItemDaGrade;
  indice: number;
  total: number;
  grade: TGradeDaHome;
};

function LinhaDoWidget({ widget, item, indice, total, grade }: TLinhaProps) {
  const salvar = (novo: TItemDaGrade[]) => void grade.saveLayout(novo);
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="flex shrink-0 flex-col">
        <button
          type="button"
          aria-label={`Subir ${widget.titulo}`}
          disabled={indice === 0}
          onClick={() => salvar(moveWidgetBy(grade.layout, item.chave, -1))}
          className={BOTAO_DE_ICONE}
        >
          <ArrowUp aria-hidden className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={`Descer ${widget.titulo}`}
          disabled={indice === total - 1}
          onClick={() => salvar(moveWidgetBy(grade.layout, item.chave, 1))}
          className={BOTAO_DE_ICONE}
        >
          <ArrowDown aria-hidden className="size-3.5" />
        </button>
      </div>
      <div className={cn("min-w-0 flex-1", !item.ligado && "opacity-60")}>
        <p className="flex items-center gap-2 text-13 font-medium text-primary">
          <span className="truncate">{widget.titulo}</span>
          {widget.origem === "instalado" && (
            <span className="shrink-0 rounded-full bg-accent-subtle px-1.5 py-0.5 text-10 font-medium text-accent-primary">
              Instalado
            </span>
          )}
        </p>
        <p className="truncate text-12 text-tertiary">{widget.descricao}</p>
      </div>
      <select
        aria-label={`Tamanho de ${widget.titulo}`}
        value={item.tamanho}
        onChange={(evento) =>
          isTamanhoDeWidget(evento.target.value) && salvar(setTamanho(grade.layout, item.chave, evento.target.value))
        }
        className="h-7 shrink-0 rounded-md border border-subtle bg-surface-1 px-1.5 text-12 text-primary focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:outline-none dark:bg-layer-1"
      >
        {TAMANHOS_DE_WIDGET.map((tamanho) => (
          <option key={tamanho} value={tamanho}>
            {ROTULO_DO_TAMANHO[tamanho]}
          </option>
        ))}
      </select>
      <ToggleSwitch
        value={item.ligado}
        label={`Mostrar ${widget.titulo}`}
        onChange={(ligado) => salvar(setLigado(grade.layout, item.chave, ligado))}
      />
    </li>
  );
}

/**
 * "Gerenciar widgets": todos os widgets (nativos e instalados) com ligar e
 * desligar, tamanho e ordem por setas. Cada mudança vale na hora; "Restaurar
 * padrão" volta ao layout do catálogo.
 */
export const GerenciarWidgets = observer(function GerenciarWidgets({ workspaceSlug }: { workspaceSlug: string }) {
  const { showWidgetSettings, toggleWidgetSettings } = useHome();
  const grade = useGradeDaHome(workspaceSlug);
  const fechar = () => toggleWidgetSettings(false);

  return (
    <ModalCore isOpen={showWidgetSettings} handleClose={fechar} width={EModalWidth.XXL}>
      <div className="flex max-h-[80vh] flex-col">
        <header className="flex items-start justify-between gap-3 border-b border-subtle px-5 py-4">
          <div>
            <h2 className="text-16 font-semibold text-primary">Gerenciar widgets</h2>
            <p className="mt-0.5 text-12 text-tertiary">
              Escolha o que aparece na sua página inicial. Na grade, arraste um widget pela alça para mudar de lugar.
            </p>
          </div>
          <button type="button" aria-label="Fechar" onClick={fechar} className={BOTAO_DE_ICONE}>
            <X aria-hidden className="size-4" />
          </button>
        </header>
        <ul aria-label="Widgets" className="divide-y divide-subtle overflow-y-auto px-5">
          {grade.layout.map((item, indice) => {
            const widget = grade.widgetPorChave.get(item.chave);
            if (!widget) return null;
            return (
              <LinhaDoWidget
                key={item.chave}
                widget={widget}
                item={item}
                indice={indice}
                total={grade.layout.length}
                grade={grade}
              />
            );
          })}
        </ul>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-subtle px-5 py-3">
          <button
            type="button"
            onClick={() => void grade.restoreLayoutPadrao()}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-13 text-secondary hover:bg-layer-1 hover:text-primary focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:outline-none"
          >
            <RotateCcw aria-hidden className="size-3.5" /> Restaurar padrão
          </button>
          <div className="flex items-center gap-3">
            <Link
              href={`/${workspaceSlug}/developers/widgets`}
              onClick={fechar}
              className="rounded text-13 text-accent-primary hover:underline focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:outline-none"
            >
              Como criar um widget?
            </Link>
            <button
              type="button"
              onClick={fechar}
              className="rounded-md bg-accent-primary px-3 py-1.5 text-13 font-medium text-on-color focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:outline-none"
            >
              Concluir
            </button>
          </div>
        </footer>
      </div>
    </ModalCore>
  );
});
