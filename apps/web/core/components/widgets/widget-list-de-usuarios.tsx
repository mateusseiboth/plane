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
    return <div className="flex items-center justify-center py-16 text-tertiary">Carregando widgets…</div>;
  }

  if (widgets.length === 0) {
    return (
      <p className="py-16 text-center text-13 text-tertiary">
        Ninguém enviou um widget próprio ainda. Eles aparecem aqui quando alguém usa Enviar meu widget na página
        inicial.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-13">
        <thead>
          <tr className="border-b border-subtle text-11 font-medium text-tertiary uppercase">
            <th className="py-3 pr-4">Nome</th>
            <th className="py-3 pr-4">Versão</th>
            <th className="py-3 pr-4">Enviado por</th>
            <th className="py-3 pr-4">Enviado em</th>
            <th className="py-3">Ações</th>
          </tr>
        </thead>
        <tbody>
          {widgets.map((widget) => (
            <tr key={widget.id} className="border-b border-subtle">
              <td className="py-3 pr-4">
                <button
                  type="button"
                  className="font-medium text-primary hover:text-accent-primary"
                  onClick={() => onSelect(widget)}
                >
                  {widget.name}
                </button>
                {widget.description && (
                  <p className="mt-0.5 line-clamp-1 text-11 text-tertiary">{widget.description}</p>
                )}
              </td>
              <td className="font-mono py-3 pr-4 text-11 text-secondary">{widget.version}</td>
              <td className="py-3 pr-4 text-secondary">
                {readNomeDoDono(widget)}
                {widget.owner?.email && <p className="text-11 text-tertiary">{widget.owner.email}</p>}
              </td>
              <td className="py-3 pr-4 text-secondary">{formatData(widget.created_at)}</td>
              <td className="py-3">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => onMakeGlobal(widget)}
                    className="text-11 text-accent-primary hover:underline"
                  >
                    Tornar global
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(widget)}
                    className="text-11 text-danger-primary hover:underline"
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
