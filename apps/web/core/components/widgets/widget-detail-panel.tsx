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
    <div className="shadow-xl fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col bg-surface-1">
      <div className="flex items-center justify-between border-b border-subtle px-6 py-4">
        <h2 className="text-16 font-semibold text-primary">{widget.name}</h2>
        <button onClick={onClose} className="text-tertiary hover:text-primary">
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
              <span className="text-13 text-tertiary">Nenhum</span>
            ) : (
              widget.permissions.map((p) => (
                <span key={p} className="rounded bg-accent-subtle px-2 py-0.5 text-11 font-medium text-accent-primary">
                  {p}
                </span>
              ))
            )}
          </div>
        </Section>

        <Section title="Manifesto (bruto)">
          <pre className="overflow-x-auto rounded bg-layer-1 p-3 text-11 text-secondary">
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
    <h3 className="mb-3 text-11 font-semibold tracking-wide text-tertiary uppercase">{title}</h3>
    {children}
  </div>
);

const Row: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="flex justify-between py-1 text-13">
    <span className="text-tertiary">{label}</span>
    <span className={`text-primary ${mono ? "font-mono text-11" : ""}`}>{value}</span>
  </div>
);
