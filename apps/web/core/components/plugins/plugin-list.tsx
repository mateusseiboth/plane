"use client";

import React from "react";
import type { IPlugin } from "@/services/plugin.service";

const STATUS_LABELS: Record<IPlugin["status"], { label: string; className: string }> = {
  ACTIVE: { label: "Ativo", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  INACTIVE: { label: "Inativo", className: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400" },
  PENDING_APPROVAL: { label: "Pendente", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  ARCHIVED: { label: "Arquivado", className: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
};

interface PluginListProps {
  plugins: IPlugin[];
  isLoading: boolean;
  onActivate: (id: string) => void;
  onDeactivate: (id: string) => void;
  onRemove: (id: string) => void;
  onSelect: (plugin: IPlugin) => void;
}

export const PluginList: React.FC<PluginListProps> = ({
  plugins,
  isLoading,
  onActivate,
  onDeactivate,
  onRemove,
  onSelect,
}) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-neutral-400">
        Carregando plugins…
      </div>
    );
  }

  if (plugins.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-neutral-400">
        <div className="text-4xl">🔌</div>
        <p className="mt-3 text-sm">Nenhum plugin encontrado. Envie seu primeiro plugin para começar.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-xs font-medium uppercase text-neutral-500 dark:border-neutral-700">
            <th className="py-3 pr-4">Nome</th>
            <th className="py-3 pr-4">Versão</th>
            <th className="py-3 pr-4">Autor</th>
            <th className="py-3 pr-4">Superfícies</th>
            <th className="py-3 pr-4">Status</th>
            <th className="py-3">Ações</th>
          </tr>
        </thead>
        <tbody>
          {plugins.map((p) => {
            const statusMeta = STATUS_LABELS[p.status];
            const pages = p.contributions?.pages?.length ?? 0;
            const sidebar = p.contributions?.sidebar?.length ?? 0;
            return (
              <tr
                key={p.id}
                className="border-b border-neutral-100 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/50"
              >
                <td className="py-3 pr-4">
                  <button
                    className="font-medium text-neutral-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
                    onClick={() => onSelect(p)}
                  >
                    {p.name}
                  </button>
                  {p.description && (
                    <p className="mt-0.5 text-xs text-neutral-500 line-clamp-1">{p.description}</p>
                  )}
                </td>
                <td className="py-3 pr-4 font-mono text-xs text-neutral-600 dark:text-neutral-400">
                  {p.version}
                </td>
                <td className="py-3 pr-4 text-neutral-600 dark:text-neutral-400">{p.author}</td>
                <td className="py-3 pr-4">
                  <div className="flex flex-wrap gap-1">
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                      {pages} {pages === 1 ? "página" : "páginas"}
                    </span>
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                      {sidebar} na barra lateral
                    </span>
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusMeta.className}`}>
                    {statusMeta.label}
                  </span>
                </td>
                <td className="py-3">
                  <div className="flex gap-2">
                    {p.status !== "ACTIVE" && p.status !== "ARCHIVED" && (
                      <button
                        onClick={() => onActivate(p.id)}
                        className="text-xs text-green-600 hover:underline dark:text-green-400"
                      >
                        Ativar
                      </button>
                    )}
                    {p.status === "ACTIVE" && (
                      <button
                        onClick={() => onDeactivate(p.id)}
                        className="text-xs text-yellow-600 hover:underline dark:text-yellow-400"
                      >
                        Desativar
                      </button>
                    )}
                    {p.status !== "ARCHIVED" && (
                      <button
                        onClick={() => {
                          if (window.confirm(`Remover o plugin "${p.name}"?`)) onRemove(p.id);
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
