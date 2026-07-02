"use client";

import React from "react";
import type { IWidget } from "@/services/widget.service";

const STATUS_LABELS: Record<IWidget["status"], { label: string; className: string }> = {
  ACTIVE: { label: "Active", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  INACTIVE: { label: "Inactive", className: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400" },
  PENDING_APPROVAL: { label: "Pending", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  ARCHIVED: { label: "Archived", className: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
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
    return (
      <div className="flex items-center justify-center py-16 text-neutral-400">
        Loading widgets…
      </div>
    );
  }

  if (widgets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-neutral-400">
        <div className="text-4xl">🧩</div>
        <p className="mt-3 text-sm">Nenhum widget encontrado. Envie seu primeiro widget para começar.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-xs font-medium uppercase text-neutral-500 dark:border-neutral-700">
            <th className="py-3 pr-4">Name</th>
            <th className="py-3 pr-4">Version</th>
            <th className="py-3 pr-4">Author</th>
            <th className="py-3 pr-4">Permissions</th>
            <th className="py-3 pr-4">Status</th>
            <th className="py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {widgets.map((w) => {
            const statusMeta = STATUS_LABELS[w.status];
            return (
              <tr
                key={w.id}
                className="border-b border-neutral-100 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/50"
              >
                <td className="py-3 pr-4">
                  <button
                    className="font-medium text-neutral-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
                    onClick={() => onSelect(w)}
                  >
                    {w.name}
                  </button>
                  {w.description && (
                    <p className="mt-0.5 text-xs text-neutral-500 line-clamp-1">{w.description}</p>
                  )}
                </td>
                <td className="py-3 pr-4 font-mono text-xs text-neutral-600 dark:text-neutral-400">
                  {w.version}
                </td>
                <td className="py-3 pr-4 text-neutral-600 dark:text-neutral-400">{w.author}</td>
                <td className="py-3 pr-4">
                  <div className="flex flex-wrap gap-1">
                    {w.permissions.map((p) => (
                      <span
                        key={p}
                        className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusMeta.className}`}>
                    {statusMeta.label}
                  </span>
                </td>
                <td className="py-3">
                  <div className="flex gap-2">
                    {w.status !== "ACTIVE" && w.status !== "ARCHIVED" && (
                      <button
                        onClick={() => onActivate(w.id)}
                        className="text-xs text-green-600 hover:underline dark:text-green-400"
                      >
                        Activate
                      </button>
                    )}
                    {w.status === "ACTIVE" && (
                      <button
                        onClick={() => onDeactivate(w.id)}
                        className="text-xs text-yellow-600 hover:underline dark:text-yellow-400"
                      >
                        Deactivate
                      </button>
                    )}
                    {w.status !== "ARCHIVED" && (
                      <button
                        onClick={() => {
                          if (window.confirm(`Remove widget "${w.name}"?`)) onRemove(w.id);
                        }}
                        className="text-xs text-red-600 hover:underline dark:text-red-400"
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
