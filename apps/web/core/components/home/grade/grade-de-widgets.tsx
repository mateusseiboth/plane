/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useId, useRef, useState } from "react";
import { observer } from "mobx-react";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { LayoutGrid } from "lucide-react";
// components
import { CLASSE_DO_CARTAO, VazioDoCartao } from "@/components/home/painel/cartao";
import { isEventoDoPainel } from "@/components/home/painel/painel-rules";
import {
  buildAnuncioDaPosicao,
  moveWidgetAoLado,
  resolveLadoDaBorda,
  resolveVizinhoDoPasso,
  setLigado,
  setTamanho,
} from "@/components/home/grade/grade-rules";
import type {
  TItemDaGrade,
  TLadoDaSoltura,
  TPassoDoTeclado,
  TTamanhoDeWidget,
} from "@/components/home/grade/grade-rules";
import { ItemDaGrade, TIPO_DO_ARRASTO } from "@/components/home/grade/item-da-grade";
// hooks
import { useHome } from "@/hooks/store/use-home";
import { useGradeDaHome } from "@/hooks/use-grade-da-home";
import { refreshPainelDaHome } from "@/hooks/use-home-painel";
import { useRealtimeRefetch } from "@/hooks/use-realtime";

type TProps = { workspaceSlug: string; userId: string };

const readOrdem = (layout: TItemDaGrade[]) => layout.map((item) => item.chave).join("|");

/** Mesmas larguras do layout padrão, para o esqueleto não pular quando a grade chega. */
const ESQUELETO = [
  "lg:col-span-6 h-14",
  "lg:col-span-4 h-80",
  "lg:col-span-2 h-80",
  "lg:col-span-4 h-72",
  "lg:col-span-2 h-72",
];

function EsqueletoDaGrade() {
  return (
    <div aria-hidden className="grid grid-cols-1 gap-5 lg:grid-cols-6">
      {ESQUELETO.map((classe) => (
        <div key={classe} className={`${CLASSE_DO_CARTAO} animate-pulse ${classe}`} />
      ))}
    </div>
  );
}

const GradeVazia = observer(function GradeVazia() {
  const { toggleWidgetSettings } = useHome();
  return (
    <div className={CLASSE_DO_CARTAO}>
      <VazioDoCartao
        icone={LayoutGrid}
        titulo="Nenhum widget na página inicial"
        detalhe="Escolha o que mostrar aqui."
      />
      <div className="flex justify-center pb-6">
        <button
          type="button"
          onClick={() => toggleWidgetSettings(true)}
          className="rounded-md bg-accent-primary px-3 py-1.5 text-13 font-medium text-on-color focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:outline-none"
        >
          Gerenciar widgets
        </button>
      </div>
    </div>
  );
});

/**
 * A home é uma grade de widgets: cada cartão (nativo ou instalado do
 * marketplace) pode ser arrastado pela alça, levado com as setas do teclado,
 * redimensionado e ocultado. A grade salva a organização de cada pessoa em
 * cada espaço.
 */
export function GradeDeWidgets({ workspaceSlug, userId }: TProps) {
  const grade = useGradeDaHome(workspaceSlug);
  const [anuncio, setAnuncio] = useState("");
  const idDaInstrucao = useId();
  const visiveis = grade.layout.filter((item) => item.ligado);

  useRealtimeRefetch(
    (evento) => isEventoDoPainel(evento, userId),
    () => void refreshPainelDaHome(),
    1500
  );

  const tituloDe = (chave: string) => grade.widgetPorChave.get(chave)?.titulo ?? "Widget";

  const announcePosicao = (novo: TItemDaGrade[], chave: string) => {
    const ligados = novo.filter((item) => item.ligado);
    setAnuncio(
      buildAnuncioDaPosicao(
        tituloDe(chave),
        ligados.findIndex((item) => item.chave === chave),
        ligados.length
      )
    );
  };

  const moveAoLado = (chave: string, alvo: string, lado: TLadoDaSoltura) => {
    const novo = moveWidgetAoLado(grade.layout, chave, alvo, lado);
    if (readOrdem(novo) === readOrdem(grade.layout)) return;
    announcePosicao(novo, chave);
    void grade.saveLayout(novo);
  };

  const onMove = (chave: string, passo: TPassoDoTeclado) => {
    const destino = resolveVizinhoDoPasso(visiveis, chave, passo);
    if (!destino) return;
    moveAoLado(chave, destino.alvo, destino.lado);
  };

  const onResize = (chave: string, tamanho: TTamanhoDeWidget) =>
    void grade.saveLayout(setTamanho(grade.layout, chave, tamanho));

  const onHide = (chave: string) => {
    setAnuncio(`${tituloDe(chave)} oculto. Para mostrar de novo, use Gerenciar widgets.`);
    void grade.saveLayout(setLigado(grade.layout, chave, false));
  };

  // O monitor é registrado uma vez e chama sempre a versão mais nova do move (layout atual).
  const refDoMoveAoLado = useRef(moveAoLado);
  useEffect(() => {
    refDoMoveAoLado.current = moveAoLado;
  });

  // Quem decide o destino é o monitor da grade: o alvo sob o ponteiro e a borda mais próxima dele.
  useEffect(
    () =>
      monitorForElements({
        canMonitor: ({ source }) => source.data.tipo === TIPO_DO_ARRASTO,
        onDrop: ({ source, location }) => {
          const alvo = location.current.dropTargets[0];
          if (!alvo) return;
          const lado = resolveLadoDaBorda(extractClosestEdge(alvo.data));
          refDoMoveAoLado.current(String(source.data.chave), String(alvo.data.chave), lado);
        },
      }),
    []
  );

  if (grade.isLoading) return <EsqueletoDaGrade />;
  if (!visiveis.length) return <GradeVazia />;

  return (
    <>
      <p id={idDaInstrucao} className="sr-only">
        Arraste pela alça ou use as setas para mudar a posição.
      </p>
      <ul aria-label="Widgets da página inicial" className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-6">
        {visiveis.map((item) => {
          const widget = grade.widgetPorChave.get(item.chave);
          if (!widget) return null;
          return (
            <ItemDaGrade
              key={item.chave}
              widget={widget}
              item={item}
              workspaceSlug={workspaceSlug}
              userId={userId}
              idDaInstrucao={idDaInstrucao}
              onMove={onMove}
              onResize={onResize}
              onHide={onHide}
            />
          );
        })}
      </ul>
      <div aria-live="polite" className="sr-only">
        {anuncio}
      </div>
    </>
  );
}
