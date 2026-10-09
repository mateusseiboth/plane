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
      <div className="mx-auto max-w-6xl px-4 py-16 text-center text-13 text-tertiary">
        Somente quem administra a instância ou é do TI gerencia widgets.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-20 font-bold text-primary">Loja de widgets</h1>
          <p className="mt-1 text-13 text-tertiary">
            Os globais aparecem na página inicial de todos. Os de usuários, só para quem enviou.
          </p>
        </div>
        <button
          onClick={() => setUploadOpen(true)}
          className="rounded-lg bg-accent-primary px-4 py-2 text-13 font-medium text-on-color hover:opacity-90"
        >
          + Enviar widget
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg bg-danger-subtle p-3 text-13 text-danger-primary">{error}</div>}

      <div role="tablist" aria-label="Widgets" className="mb-4 flex gap-1 border-b border-subtle">
        {ABAS.map((aba) => (
          <button
            key={aba.escopo}
            type="button"
            role="tab"
            aria-selected={escopo === aba.escopo}
            onClick={() => setEscopo(aba.escopo)}
            className={`-mb-px border-b-2 px-3 py-2 text-13 font-medium ${
              escopo === aba.escopo
                ? "border-accent-strong text-accent-primary"
                : "border-transparent text-tertiary hover:text-primary"
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
          className="rounded-lg border border-subtle px-3 py-2 text-13 outline-none focus:ring-2 focus:ring-accent-strong"
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
          className="rounded-lg border border-subtle px-3 py-2 text-13 text-secondary hover:bg-layer-1"
        >
          Atualizar
        </button>
      </div>

      <div className="rounded-xl border border-subtle bg-surface-1 p-4">
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
