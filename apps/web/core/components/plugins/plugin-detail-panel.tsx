"use client";

import React from "react";
import { PluginSettingsForm } from "@/components/plugins/plugin-settings-form";
import type { IPlugin } from "@/services/plugin.service";

interface PluginDetailPanelProps {
  plugin: IPlugin;
  onClose: () => void;
}

export const PluginDetailPanel: React.FC<PluginDetailPanelProps> = ({ plugin, onClose }) => {
  const manifest = plugin.manifest as Record<string, unknown>;
  const pages = plugin.contributions?.pages ?? [];
  const sidebar = plugin.contributions?.sidebar ?? [];

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col bg-white shadow-xl dark:bg-neutral-900">
      <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-700">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">{plugin.name}</h2>
        <button
          onClick={onClose}
          className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        <Section title="Metadados">
          <Row label="Slug" value={plugin.slug} mono />
          <Row label="Versão" value={plugin.version} />
          <Row label="Autor" value={plugin.author} />
          <Row label="Status" value={plugin.status} />
          <Row label="Arquivo de entrada" value={plugin.entry_file} mono />
          {plugin.description && <Row label="Descrição" value={plugin.description} />}
        </Section>

        <Section title="Permissões">
          <div className="flex flex-wrap gap-2">
            {plugin.permissions.length === 0 ? (
              <span className="text-sm text-neutral-500">Nenhum</span>
            ) : (
              plugin.permissions.map((p) => (
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

        <Section title="Páginas">
          {pages.length === 0 ? (
            <span className="text-sm text-neutral-500">Nenhum</span>
          ) : (
            <ul className="space-y-1 text-sm">
              {pages.map((pg) => (
                <li key={pg.path} className="flex justify-between">
                  <span className="text-neutral-900 dark:text-white">{pg.title}</span>
                  <span className="font-mono text-xs text-neutral-500">/{pg.path}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Itens da barra lateral">
          {sidebar.length === 0 ? (
            <span className="text-sm text-neutral-500">Nenhum</span>
          ) : (
            <ul className="space-y-1 text-sm">
              {sidebar.map((s) => (
                <li key={s.id} className="flex justify-between">
                  <span className="text-neutral-900 dark:text-white">{s.label}</span>
                  <span className="font-mono text-xs text-neutral-500">→ /{s.page}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Configurações">
          <PluginSettingsForm pluginId={plugin.id} />
        </Section>

        <Section title="Manifesto (bruto)">
          <pre className="overflow-x-auto rounded bg-neutral-100 p-3 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
            {JSON.stringify(manifest, null, 2)}
          </pre>
        </Section>

        <Section title="Datas">
          <Row label="Criado em" value={new Date(plugin.created_at).toLocaleString()} />
          <Row label="Atualizado em" value={new Date(plugin.updated_at).toLocaleString()} />
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
