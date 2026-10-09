/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { ArrowDown, ArrowUp, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalWidth, ModalCore, ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import {
  ROTULO_DO_TAMANHO,
  TAMANHOS_DE_WIDGET,
  isTamanhoDeWidget,
  moveWidgetBy,
  readIdDeInstalado,
  setLigado,
  setTamanho,
} from "@/components/home/grade/grade-rules";
import type { TItemDaGrade } from "@/components/home/grade/grade-rules";
import type { TWidgetDaHome } from "@/components/home/grade/tipos";
// hooks
import { useHome } from "@/hooks/store/use-home";
import { useGradeDaHome } from "@/hooks/use-grade-da-home";
import type { TGradeDaHome } from "@/hooks/use-grade-da-home";
import { useMeusWidgets } from "@/hooks/use-meus-widgets";

const BOTAO_DE_ICONE =
  "flex size-7 items-center justify-center rounded-md text-secondary hover:bg-layer-1 hover:text-primary disabled:pointer-events-none disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:outline-none";

/** Selo ao lado do título: o nativo não tem; o instalado e o meu, sim. */
const SELO_DA_ORIGEM: Partial<Record<TWidgetDaHome["origem"], string>> = { instalado: "Instalado", meu: "Meu" };

const readMensagemDoErro = (erro: unknown) =>
  (erro as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
  "Não foi possível concluir. Tente de novo.";

type TLinhaProps = {
  widget: TWidgetDaHome;
  item: TItemDaGrade;
  indice: number;
  total: number;
  grade: TGradeDaHome;
  onRemoveMeu: (widget: TWidgetDaHome) => void;
};

function LinhaDoWidget({ widget, item, indice, total, grade, onRemoveMeu }: TLinhaProps) {
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
          {SELO_DA_ORIGEM[widget.origem] && (
            <span className="shrink-0 rounded-full bg-accent-subtle px-1.5 py-0.5 text-10 font-medium text-accent-primary">
              {SELO_DA_ORIGEM[widget.origem]}
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
      {widget.origem === "meu" && (
        <button
          type="button"
          aria-label={`Remover ${widget.titulo}`}
          onClick={() => onRemoveMeu(widget)}
          className={BOTAO_DE_ICONE}
        >
          <Trash2 aria-hidden className="size-3.5" />
        </button>
      )}
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
  const meus = useMeusWidgets();
  const seletorDoZip = useRef<HTMLInputElement>(null);
  const fechar = () => toggleWidgetSettings(false);

  const onZipEscolhido = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    try {
      const widget = await meus.uploadMeuWidget(arquivo);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Widget enviado",
        message: `${widget.name} entrou no fim da sua página inicial.`,
      });
    } catch (erro) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Widget não enviado", message: readMensagemDoErro(erro) });
    }
  };

  const onRemoveMeu = async (widget: TWidgetDaHome) => {
    const id = readIdDeInstalado(widget.chave);
    if (!id || !window.confirm(`Remover "${widget.titulo}" da sua página inicial?`)) return;
    try {
      await meus.removeMeuWidget(id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Widget removido", message: `${widget.titulo} foi removido.` });
    } catch (erro) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Widget não removido", message: readMensagemDoErro(erro) });
    }
  };

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
                onRemoveMeu={(alvo) => void onRemoveMeu(alvo)}
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
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={seletorDoZip}
              type="file"
              accept=".zip"
              hidden
              onChange={(evento) => {
                void onZipEscolhido(evento.target.files?.[0]);
                evento.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={meus.isUploading}
              onClick={() => seletorDoZip.current?.click()}
              title="O widget aparece só na sua página inicial."
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-13 text-secondary hover:bg-layer-1 hover:text-primary focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:outline-none disabled:opacity-50"
            >
              <Upload aria-hidden className="size-3.5" /> {meus.isUploading ? "Enviando…" : "Enviar meu widget"}
            </button>
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
