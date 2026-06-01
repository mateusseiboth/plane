"use client";

import React, { useState } from "react";
import { observer } from "mobx-react";
import { usePlugins } from "@/hooks/use-plugins";
import { PluginList } from "./plugin-list";
import { PluginUploadModal } from "./plugin-upload-modal";
import { PluginDetailPanel } from "./plugin-detail-panel";
import type { IPlugin } from "@/services/plugin.service";

export const PluginAdminPage: React.FC = observer(() => {
  const {
    plugins,
    isLoading,
    isUploading,
    error,
    uploadPlugin,
    activatePlugin,
    deactivatePlugin,
    removePlugin,
    refetch,
  } = usePlugins();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedPlugin, setSelectedPlugin] = useState<IPlugin | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const filtered = plugins.filter((p) => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Plugins</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Plugins extend the app with sidebar items and full pages. Manage dynamically loaded plugins for this instance.
          </p>
        </div>
        <button
          onClick={() => setUploadOpen(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Upload Plugin
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
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="PENDING_APPROVAL">Pending</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <button
          onClick={refetch}
          className="rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          Refresh
        </button>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
        <PluginList
          plugins={filtered}
          isLoading={isLoading}
          onActivate={activatePlugin}
          onDeactivate={deactivatePlugin}
          onRemove={removePlugin}
          onSelect={setSelectedPlugin}
        />
      </div>

      <PluginUploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUpload={uploadPlugin}
        isUploading={isUploading}
      />

      {selectedPlugin && (
        <PluginDetailPanel plugin={selectedPlugin} onClose={() => setSelectedPlugin(null)} />
      )}
    </div>
  );
});
