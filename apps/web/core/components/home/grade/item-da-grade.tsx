/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { attachClosestEdge, extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import type { Edge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { EyeOff, GripVertical } from "lucide-react";
import { cn } from "@plane/utils";
// local imports
import { ROTULO_DO_TAMANHO, TAMANHOS_DE_WIDGET } from "@/components/home/grade/grade-rules";
import type { TItemDaGrade, TPassoDoTeclado, TTamanhoDeWidget } from "@/components/home/grade/grade-rules";
import type { TWidgetDaHome } from "@/components/home/grade/tipos";

/** Marca dos arrastos da grade: só item da grade cai em item da grade. */
export const TIPO_DO_ARRASTO = "widget-da-home";

/**
 * Largura de cada tamanho. Abaixo de `md` tudo é uma coluna; em `md` a grade
 * tem 2 colunas (terço e meio viram meia largura); de `lg` em diante, 6 colunas.
 */
const CLASSE_DO_TAMANHO: Record<TTamanhoDeWidget, string> = {
  "1/3": "md:col-span-1 lg:col-span-2",
  "1/2": "md:col-span-1 lg:col-span-3",
  "2/3": "md:col-span-2 lg:col-span-4",
  "1/1": "md:col-span-2 lg:col-span-6",
};

/** Linha que mostra onde o widget vai cair, no meio do espaço entre os cartões. */
const CLASSE_DA_BORDA: Record<Edge, string> = {
  top: "inset-x-0 -top-3 h-0.5",
  bottom: "inset-x-0 -bottom-3 h-0.5",
  left: "inset-y-0 -left-3 w-0.5",
  right: "inset-y-0 -right-3 w-0.5",
};

/** Teclado na alça: setas andam uma casa, Home e End vão para as pontas. */
const PASSO_POR_TECLA: Record<string, TPassoDoTeclado> = {
  ArrowLeft: "anterior",
  ArrowUp: "anterior",
  ArrowRight: "proximo",
  ArrowDown: "proximo",
  Home: "primeiro",
  End: "ultimo",
};

const BOTAO_DA_BARRA =
  "flex h-6 items-center justify-center rounded-md px-1.5 text-11 font-medium text-secondary hover:bg-layer-1 hover:text-primary focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:outline-none";

type TProps = {
  widget: TWidgetDaHome;
  item: TItemDaGrade;
  workspaceSlug: string;
  userId: string;
  idDaInstrucao: string;
  onMove: (chave: string, passo: TPassoDoTeclado) => void;
  onResize: (chave: string, tamanho: TTamanhoDeWidget) => void;
  onHide: (chave: string) => void;
};

function SeletorDeTamanho({ widget, item, onResize }: Pick<TProps, "widget" | "item" | "onResize">) {
  return (
    <div role="radiogroup" aria-label={`Tamanho de ${widget.titulo}`} className="hidden items-center gap-0.5 md:flex">
      {TAMANHOS_DE_WIDGET.map((tamanho) => (
        <button
          key={tamanho}
          type="button"
          role="radio"
          aria-checked={item.tamanho === tamanho}
          title={`Largura ${ROTULO_DO_TAMANHO[tamanho]}`}
          onClick={() => onResize(item.chave, tamanho)}
          className={cn(BOTAO_DA_BARRA, item.tamanho === tamanho && "bg-accent-subtle text-accent-primary")}
        >
          {ROTULO_DO_TAMANHO[tamanho]}
        </button>
      ))}
    </div>
  );
}

/**
 * Um widget na grade. A barra de controle (alça, tamanho e ocultar) aparece no
 * passar do mouse ou no foco, em cima da borda do cartão, para não disputar
 * espaço com as ações do próprio widget.
 */
export function ItemDaGrade({ widget, item, workspaceSlug, userId, idDaInstrucao, onMove, onResize, onHide }: TProps) {
  const refDoItem = useRef<HTMLLIElement>(null);
  const refDaAlca = useRef<HTMLButtonElement>(null);
  const [isArrastando, setIsArrastando] = useState(false);
  const [borda, setBorda] = useState<Edge | null>(null);
  const Componente = widget.componente;

  useEffect(() => {
    const elemento = refDoItem.current;
    const alca = refDaAlca.current;
    if (!elemento || !alca) return;
    return combine(
      draggable({
        element: elemento,
        dragHandle: alca,
        getInitialData: () => ({ tipo: TIPO_DO_ARRASTO, chave: item.chave }),
        onDragStart: () => setIsArrastando(true),
        onDrop: () => setIsArrastando(false),
      }),
      dropTargetForElements({
        element: elemento,
        canDrop: ({ source }) => source.data.tipo === TIPO_DO_ARRASTO && source.data.chave !== item.chave,
        getData: ({ input, element }) =>
          attachClosestEdge(
            { chave: item.chave },
            { input, element, allowedEdges: ["top", "bottom", "left", "right"] }
          ),
        onDrag: ({ self }) => setBorda(extractClosestEdge(self.data)),
        onDragLeave: () => setBorda(null),
        onDrop: () => setBorda(null),
      })
    );
  }, [item.chave]);

  const onKeyDownDaAlca = (evento: KeyboardEvent<HTMLButtonElement>) => {
    const passo = PASSO_POR_TECLA[evento.key];
    if (!passo) return;
    evento.preventDefault();
    onMove(item.chave, passo);
    // Reordenar move o nó no DOM e o navegador tira o foco dele: devolve para a alça.
    requestAnimationFrame(() => refDaAlca.current?.focus());
  };

  return (
    <li
      ref={refDoItem}
      data-widget={item.chave}
      className={cn(
        "group/widget relative flex min-w-0 flex-col *:grow",
        CLASSE_DO_TAMANHO[item.tamanho],
        isArrastando && "opacity-40"
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute -top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-subtle bg-surface-1 p-0.5 opacity-0 shadow-raised-200 transition-opacity",
          "group-focus-within/widget:pointer-events-auto group-focus-within/widget:opacity-100 group-hover/widget:pointer-events-auto group-hover/widget:opacity-100",
          "dark:bg-layer-1",
          isArrastando && "invisible"
        )}
      >
        <button
          ref={refDaAlca}
          type="button"
          aria-label={`Mover ${widget.titulo}`}
          aria-describedby={idDaInstrucao}
          onKeyDown={onKeyDownDaAlca}
          className={cn(BOTAO_DA_BARRA, "cursor-grab active:cursor-grabbing")}
        >
          <GripVertical aria-hidden className="size-3.5" />
        </button>
        <SeletorDeTamanho widget={widget} item={item} onResize={onResize} />
        <button
          type="button"
          aria-label={`Ocultar ${widget.titulo}`}
          title="Ocultar"
          onClick={() => onHide(item.chave)}
          className={BOTAO_DA_BARRA}
        >
          <EyeOff aria-hidden className="size-3.5" />
        </button>
      </div>
      {borda && <span aria-hidden className={cn("absolute rounded-full bg-accent-primary", CLASSE_DA_BORDA[borda])} />}
      <Componente workspaceSlug={workspaceSlug} userId={userId} chave={item.chave} tamanho={item.tamanho} />
    </li>
  );
}
