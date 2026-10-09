"use client";

import { useWidgets } from "@/hooks/use-widgets";
import { useCanManageExtensions } from "@/hooks/use-extensions-access";
import type { IWidget } from "@/services/widget.service";
import { observer } from "mobx-react";
import React, { useState } from "react";
import { WidgetDetailPanel } from "./widget-detail-panel";
import { WidgetList } from "./widget-list";
import { WidgetUploadModal } from "./widget-upload-modal";
import { WidgetListDeUsuarios } from "./widget-list-de-usuarios";
import { SelectPesquisavel } from "@/components/common/select-pesquisavel";
import type { TEscopoDaListagem } from "@/services/widget.service";

const ABAS: Array<{ escopo: TEscopoDaListagem; rotulo: string }> = [
  { escopo: "global", rotulo: "Globais" },
  { escopo: "users", rotulo: "De usuários" },
];

export const WidgetAdminPage: React.FC = observer(() => {
  const canManage = useCanManageExtensions();
  const {
    widgets,
    isLoading,
    isUploading,
    error,
    uploadWidget,
    activateWidget,
    deactivateWidget,
    removeWidget,
    makeWidgetGlobal,
    escopo,
    setEscopo,
    refetch,
  } = useWidgets();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedWidget, setSelectedWidget] = useState<IWidget | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const filtered = widgets.filter((w) => {
    const matchSearch = !search || w.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || w.status === statusFilter;
    return matchSearch && matchStatus;
  });

  if (!canManage) {
    return (
      <div className="text-sm text-neutral-500 dark:text-neutral-400 mx-auto max-w-6xl px-4 py-16 text-center">
        Somente quem administra a instância ou é do TI gerencia widgets.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl text-neutral-900 font-bold dark:text-white">Loja de widgets</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Os globais aparecem na página inicial de todos. Os de usuários, só para quem enviou.
          </p>
        </div>
        <button
          onClick={() => setUploadOpen(true)}
          className="bg-blue-600 text-sm hover:bg-blue-700 rounded-lg px-4 py-2 font-medium text-white"
        >
          + Enviar widget
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400 mb-4 rounded-lg p-3">
          {error}
        </div>
      )}

      <div
        role="tablist"
        aria-label="Widgets"
        className="border-neutral-200 dark:border-neutral-700 mb-4 flex gap-1 border-b"
      >
        {ABAS.map((aba) => (
          <button
            key={aba.escopo}
            type="button"
            role="tab"
            aria-selected={escopo === aba.escopo}
            onClick={() => setEscopo(aba.escopo)}
            className={`text-sm -mb-px border-b-2 px-3 py-2 font-medium ${
              escopo === aba.escopo
                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 border-transparent"
            }`}
          >
            {aba.rotulo}
          </button>
        ))}
      </div>

      <div className="mb-4 flex gap-3">
        <input
          type="text"
          placeholder="Buscar por nome…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-neutral-200 text-sm focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 rounded-lg border px-3 py-2 outline-none focus:ring-2 dark:text-white"
        />
        <SelectPesquisavel
          value={statusFilter}
          onChange={setStatusFilter}
          opcoes={[
            { value: "ACTIVE", label: "Ativo" },
            { value: "INACTIVE", label: "Inativo" },
            { value: "PENDING_APPROVAL", label: "Pendente" },
            { value: "ARCHIVED", label: "Arquivado" },
          ]}
          opcaoVazia={{ value: "", label: "Todos os status" }}
          className="w-44"
        />
        <button
          onClick={refetch}
          className="border-neutral-200 text-sm text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 rounded-lg border px-3 py-2"
        >
          Atualizar
        </button>
      </div>

      <div className="border-neutral-200 dark:border-neutral-700 dark:bg-neutral-900 rounded-xl border bg-white p-4">
        {escopo === "users" ? (
          <WidgetListDeUsuarios
            widgets={filtered}
            isLoading={isLoading}
            onMakeGlobal={(widget) => {
              if (window.confirm(`Mostrar "${widget.name}" na página inicial de todos?`))
                void makeWidgetGlobal(widget.id);
            }}
            onRemove={(widget) => {
              if (window.confirm(`Remover o widget "${widget.name}"?`)) void removeWidget(widget.id);
            }}
            onSelect={setSelectedWidget}
          />
        ) : (
          <WidgetList
            widgets={filtered}
            isLoading={isLoading}
            onActivate={activateWidget}
            onDeactivate={deactivateWidget}
            onRemove={removeWidget}
            onSelect={setSelectedWidget}
          />
        )}
      </div>

      <WidgetUploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUpload={async (file) => {
          await uploadWidget(file);
        }}
        isUploading={isUploading}
      />

      {selectedWidget && <WidgetDetailPanel widget={selectedWidget} onClose={() => setSelectedWidget(null)} />}
    </div>
  );
});
