"use client";

import { useWidgets } from "@/hooks/use-widgets";
import { useCanManageExtensions } from "@/hooks/use-extensions-access";
import type { IWidget } from "@/services/widget.service";
import { observer } from "mobx-react";
import React, { useState } from "react";
import { WidgetDetailPanel } from "./widget-detail-panel";
import { WidgetList } from "./widget-list";
import { WidgetUploadModal } from "./widget-upload-modal";
import {SelectPesquisavel} from "@/components/common/select-pesquisavel";

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
      <div className="mx-auto max-w-6xl px-4 py-16 text-center text-sm text-neutral-500 dark:text-neutral-400">
        Você não tem permissão para gerenciar widgets. Apenas administradores da instância ou usuários do grupo TI.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Loja de widgets</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Gerencie widgets carregados dinamicamente para esta instância da plataforma.
          </p>
        </div>
        <button
          onClick={() => setUploadOpen(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Enviar widget
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="mb-4 flex gap-3">
        <input
          type="text"
          placeholder="Buscar por nome…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
        />
        <SelectPesquisavel
          value={statusFilter}
          onChange={setStatusFilter}
          opcoes={[
            {value: "ACTIVE", label: "Ativo"},
            {value: "INACTIVE", label: "Inativo"},
            {value: "PENDING_APPROVAL", label: "Pendente"},
            {value: "ARCHIVED", label: "Arquivado"},
          ]}
          opcaoVazia={{value: "", label: "Todos os status"}}
          className="w-44"
        />
        <button
          onClick={refetch}
          className="rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          Atualizar
        </button>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
        <WidgetList
          widgets={filtered}
          isLoading={isLoading}
          onActivate={activateWidget}
          onDeactivate={deactivateWidget}
          onRemove={removeWidget}
          onSelect={setSelectedWidget}
        />
      </div>

      <WidgetUploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUpload={async (file) => {
          await uploadWidget(file);
        }}
        isUploading={isUploading}
      />

      {selectedWidget && (
        <WidgetDetailPanel widget={selectedWidget} onClose={() => setSelectedWidget(null)} />
      )}
    </div>
  );
});
