"use client";

import React from "react";
import type { IWidget } from "@/services/widget.service";

const STATUS_LABELS: Record<IWidget["status"], { label: string; className: string }> = {
  ACTIVE: { label: "Ativo", className: "bg-success-subtle text-success-primary" },
  INACTIVE: {
    label: "Inativo",
    className: "bg-layer-1 text-secondary",
  },
  PENDING_APPROVAL: {
    label: "Pendente",
    className: "bg-warning-subtle text-warning-primary",
  },
  ARCHIVED: { label: "Arquivado", className: "bg-danger-subtle text-danger-primary" },
};

interface WidgetListProps {
  widgets: IWidget[];
  isLoading: boolean;
  onActivate: (id: string) => void;
  onDeactivate: (id: string) => void;
  onRemove: (id: string) => void;
  onSelect: (widget: IWidget) => void;
}

export const WidgetList: React.FC<WidgetListProps> = ({
  widgets,
  isLoading,
  onActivate,
  onDeactivate,
  onRemove,
  onSelect,
}) => {
  if (isLoading) {
    return <div className="flex items-center justify-center py-16 text-tertiary">Carregando widgets…</div>;
  }

  if (widgets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-tertiary">
        <div className="text-4xl">🧩</div>
        <p className="mt-3 text-13">Nenhum widget encontrado. Envie seu primeiro widget para começar.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-13">
        <thead>
          <tr className="border-b border-subtle text-11 font-medium text-tertiary uppercase">
            <th className="py-3 pr-4">Nome</th>
            <th className="py-3 pr-4">Versão</th>
            <th className="py-3 pr-4">Autor</th>
            <th className="py-3 pr-4">Permissões</th>
            <th className="py-3 pr-4">Status</th>
            <th className="py-3">Ações</th>
          </tr>
        </thead>
        <tbody>
          {widgets.map((w) => {
            const statusMeta = STATUS_LABELS[w.status];
            return (
              <tr key={w.id} className="border-b border-subtle hover:bg-layer-1">
                <td className="py-3 pr-4">
                  <button className="font-medium text-primary hover:text-accent-primary" onClick={() => onSelect(w)}>
                    {w.name}
                  </button>
                  {w.description && <p className="mt-0.5 line-clamp-1 text-11 text-tertiary">{w.description}</p>}
                </td>
                <td className="font-mono py-3 pr-4 text-11 text-secondary">{w.version}</td>
                <td className="py-3 pr-4 text-secondary">{w.author}</td>
                <td className="py-3 pr-4">
                  <div className="flex flex-wrap gap-1">
                    {w.permissions.map((p) => (
                      <span key={p} className="rounded bg-layer-1 px-1.5 py-0.5 text-11 text-secondary">
                        {p}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <span className={`rounded-full px-2 py-0.5 text-11 font-medium ${statusMeta.className}`}>
                    {statusMeta.label}
                  </span>
                </td>
                <td className="py-3">
                  <div className="flex gap-2">
                    {w.status !== "ACTIVE" && w.status !== "ARCHIVED" && (
                      <button onClick={() => onActivate(w.id)} className="text-11 text-success-primary hover:underline">
                        Ativar
                      </button>
                    )}
                    {w.status === "ACTIVE" && (
                      <button
                        onClick={() => onDeactivate(w.id)}
                        className="text-11 text-warning-primary hover:underline"
                      >
                        Desativar
                      </button>
                    )}
                    {w.status !== "ARCHIVED" && (
                      <button
                        onClick={() => {
                          if (window.confirm(`Remover o widget "${w.name}"?`)) onRemove(w.id);
                        }}
                        className="text-11 text-danger-primary hover:underline"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
