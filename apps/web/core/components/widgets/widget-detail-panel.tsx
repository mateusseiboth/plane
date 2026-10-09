"use client";

import React from "react";
import type { IWidget } from "@/services/widget.service";

interface WidgetDetailPanelProps {
  widget: IWidget;
  onClose: () => void;
}

export const WidgetDetailPanel: React.FC<WidgetDetailPanelProps> = ({ widget, onClose }) => {
  const manifest = widget.manifest as Record<string, unknown>;

  return (
    <div className="shadow-xl dark:bg-neutral-900 fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col bg-white">
      <div className="border-neutral-200 dark:border-neutral-700 flex items-center justify-between border-b px-6 py-4">
        <h2 className="text-lg text-neutral-900 font-semibold dark:text-white">{widget.name}</h2>
        <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
        <Section title="Metadados">
          <Row label="Versão" value={widget.version} />
          <Row label="Autor" value={widget.author} />
          <Row label="Status" value={widget.status} />
          <Row label="Arquivo de entrada" value={widget.entry_file} mono />
          {widget.description && <Row label="Descrição" value={widget.description} />}
        </Section>

        <Section title="Permissões">
          <div className="flex flex-wrap gap-2">
            {widget.permissions.length === 0 ? (
              <span className="text-sm text-neutral-500">Nenhum</span>
            ) : (
              widget.permissions.map((p) => (
                <span
                  key={p}
                  className="bg-blue-100 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded px-2 py-0.5 font-medium"
                >
                  {p}
                </span>
              ))
            )}
          </div>
        </Section>

        <Section title="Manifesto (bruto)">
          <pre className="bg-neutral-100 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 overflow-x-auto rounded p-3">
            {JSON.stringify(manifest, null, 2)}
          </pre>
        </Section>

        <Section title="Datas">
          <Row label="Criado em" value={new Date(widget.created_at).toLocaleString()} />
          <Row label="Atualizado em" value={new Date(widget.updated_at).toLocaleString()} />
        </Section>
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <h3 className="text-xs text-neutral-500 dark:text-neutral-400 mb-3 font-semibold tracking-wide uppercase">
      {title}
    </h3>
    {children}
  </div>
);

const Row: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="text-sm flex justify-between py-1">
    <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
    <span className={`text-neutral-900 dark:text-white ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
  </div>
);
