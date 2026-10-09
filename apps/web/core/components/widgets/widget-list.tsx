"use client";

import React from "react";
import type { IWidget } from "@/services/widget.service";

const STATUS_LABELS: Record<IWidget["status"], { label: string; className: string }> = {
  ACTIVE: { label: "Ativo", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  INACTIVE: {
    label: "Inativo",
    className: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  },
  PENDING_APPROVAL: {
    label: "Pendente",
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  ARCHIVED: { label: "Arquivado", className: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
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
    return <div className="text-neutral-400 flex items-center justify-center py-16">Carregando widgets…</div>;
  }

  if (widgets.length === 0) {
    return (
      <div className="text-neutral-400 flex flex-col items-center justify-center py-16">
        <div className="text-4xl">🧩</div>
        <p className="text-sm mt-3">Nenhum widget encontrado. Envie seu primeiro widget para começar.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-sm w-full text-left">
        <thead>
          <tr className="border-neutral-200 text-xs text-neutral-500 dark:border-neutral-700 border-b font-medium uppercase">
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
              <tr
                key={w.id}
                className="border-neutral-100 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/50 border-b"
              >
                <td className="py-3 pr-4">
                  <button
                    className="text-neutral-900 hover:text-blue-600 dark:hover:text-blue-400 font-medium dark:text-white"
                    onClick={() => onSelect(w)}
                  >
                    {w.name}
                  </button>
                  {w.description && <p className="text-xs text-neutral-500 mt-0.5 line-clamp-1">{w.description}</p>}
                </td>
                <td className="font-mono text-xs text-neutral-600 dark:text-neutral-400 py-3 pr-4">{w.version}</td>
                <td className="text-neutral-600 dark:text-neutral-400 py-3 pr-4">{w.author}</td>
                <td className="py-3 pr-4">
                  <div className="flex flex-wrap gap-1">
                    {w.permissions.map((p) => (
                      <span
                        key={p}
                        className="bg-neutral-100 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 rounded px-1.5 py-0.5"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${statusMeta.className}`}>
                    {statusMeta.label}
                  </span>
                </td>
                <td className="py-3">
                  <div className="flex gap-2">
                    {w.status !== "ACTIVE" && w.status !== "ARCHIVED" && (
                      <button
                        onClick={() => onActivate(w.id)}
                        className="text-xs text-green-600 dark:text-green-400 hover:underline"
                      >
                        Ativar
                      </button>
                    )}
                    {w.status === "ACTIVE" && (
                      <button
                        onClick={() => onDeactivate(w.id)}
                        className="text-xs text-yellow-600 dark:text-yellow-400 hover:underline"
                      >
                        Desativar
                      </button>
                    )}
                    {w.status !== "ARCHIVED" && (
                      <button
                        onClick={() => {
                          if (window.confirm(`Remover o widget "${w.name}"?`)) onRemove(w.id);
                        }}
                        className="text-xs text-red-600 dark:text-red-400 hover:underline"
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
