/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IWidget } from "@/services/widget.service";

type TProps = {
  widgets: IWidget[];
  isLoading: boolean;
  onMakeGlobal: (widget: IWidget) => void;
  onRemove: (widget: IWidget) => void;
  onSelect: (widget: IWidget) => void;
};

const readNomeDoDono = (widget: IWidget) => {
  const nome = [widget.owner?.first_name, widget.owner?.last_name].filter(Boolean).join(" ");
  return nome || widget.owner?.display_name || "Pessoa removida";
};

const formatData = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** Aba "De usuários": widgets privados, com quem enviou, quando e a ação de publicar para todos. */
export function WidgetListDeUsuarios({ widgets, isLoading, onMakeGlobal, onRemove, onSelect }: TProps) {
  if (isLoading) {
    return <div className="text-neutral-400 flex items-center justify-center py-16">Carregando widgets…</div>;
  }

  if (widgets.length === 0) {
    return (
      <p className="text-sm text-neutral-400 py-16 text-center">
        Ninguém enviou um widget próprio ainda. Eles aparecem aqui quando alguém usa Enviar meu widget na página
        inicial.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-sm w-full text-left">
        <thead>
          <tr className="border-neutral-200 text-xs text-neutral-500 dark:border-neutral-700 border-b font-medium uppercase">
            <th className="py-3 pr-4">Nome</th>
            <th className="py-3 pr-4">Versão</th>
            <th className="py-3 pr-4">Enviado por</th>
            <th className="py-3 pr-4">Enviado em</th>
            <th className="py-3">Ações</th>
          </tr>
        </thead>
        <tbody>
          {widgets.map((widget) => (
            <tr key={widget.id} className="border-neutral-100 dark:border-neutral-800 border-b">
              <td className="py-3 pr-4">
                <button
                  type="button"
                  className="text-neutral-900 hover:text-blue-600 dark:hover:text-blue-400 font-medium dark:text-white"
                  onClick={() => onSelect(widget)}
                >
                  {widget.name}
                </button>
                {widget.description && (
                  <p className="text-xs text-neutral-500 mt-0.5 line-clamp-1">{widget.description}</p>
                )}
              </td>
              <td className="font-mono text-xs text-neutral-600 dark:text-neutral-400 py-3 pr-4">{widget.version}</td>
              <td className="text-neutral-600 dark:text-neutral-400 py-3 pr-4">
                {readNomeDoDono(widget)}
                {widget.owner?.email && <p className="text-xs text-neutral-500">{widget.owner.email}</p>}
              </td>
              <td className="text-neutral-600 dark:text-neutral-400 py-3 pr-4">{formatData(widget.created_at)}</td>
              <td className="py-3">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => onMakeGlobal(widget)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Tornar global
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(widget)}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline"
                  >
                    Remover
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
