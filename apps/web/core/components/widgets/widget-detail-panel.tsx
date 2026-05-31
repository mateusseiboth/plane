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
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col bg-white shadow-xl dark:bg-neutral-900">
      <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-700">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">{widget.name}</h2>
        <button
          onClick={onClose}
          className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        <Section title="Metadata">
          <Row label="Version" value={widget.version} />
          <Row label="Author" value={widget.author} />
          <Row label="Status" value={widget.status} />
          <Row label="Entry file" value={widget.entry_file} mono />
          {widget.description && <Row label="Description" value={widget.description} />}
        </Section>

        <Section title="Permissions">
          <div className="flex flex-wrap gap-2">
            {widget.permissions.length === 0 ? (
              <span className="text-sm text-neutral-500">None</span>
            ) : (
              widget.permissions.map((p) => (
                <span
                  key={p}
                  className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                >
                  {p}
                </span>
              ))
            )}
          </div>
        </Section>

        <Section title="Manifest (raw)">
          <pre className="overflow-x-auto rounded bg-neutral-100 p-3 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
            {JSON.stringify(manifest, null, 2)}
          </pre>
        </Section>

        <Section title="Timestamps">
          <Row label="Created" value={new Date(widget.created_at).toLocaleString()} />
          <Row label="Updated" value={new Date(widget.updated_at).toLocaleString()} />
        </Section>
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
      {title}
    </h3>
    {children}
  </div>
);

const Row: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="flex justify-between py-1 text-sm">
    <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
    <span className={`text-neutral-900 dark:text-white ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
  </div>
);
