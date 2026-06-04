"use client";

import React, { useEffect, useRef, useState, type ComponentType } from "react";
import { initializeSDK } from "@mateusseiboth/plugins-aviao";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import { PluginUiBridge } from "@/components/plugins/plugin-ui-bridge";
import { loadPluginModule } from "@/lib/plugin-module-runtime";
import { pluginRegistry } from "@/services/plugin-registry.service";
import type { IPlugin } from "@/services/plugin.service";

interface DynamicPluginProps {
  /** Plugin id (uuid). */
  pluginId: string;
  /** Page path declared in contributions.pages (defaults to first page). */
  page?: string;
  props?: Record<string, unknown>;
}

type PluginModule = Record<string, unknown>;

type State =
  | { phase: "loading" }
  | { phase: "ready"; Component: ComponentType<Record<string, unknown>>; title: string; slug: string }
  | { phase: "error"; message: string };

export const DynamicPlugin: React.FC<DynamicPluginProps> = ({ pluginId, page, props = {} }) => {
  const [state, setState] = useState<State>({ phase: "loading" });
  const loadedKey = useRef<string | null>(null);

  // Bridge plugin SDK notifications to the host toast system.
  useEffect(() => {
    const onNotification = (e: Event) => {
      const detail = (e as CustomEvent).detail as { type?: string; message?: string };
      if (!detail?.message) return;
      const map: Record<string, TOAST_TYPE> = {
        success: TOAST_TYPE.SUCCESS,
        error: TOAST_TYPE.ERROR,
        warning: TOAST_TYPE.WARNING,
        info: TOAST_TYPE.INFO,
      };
      setToast({ type: map[detail.type ?? "info"] ?? TOAST_TYPE.INFO, title: detail.message });
    };
    window.addEventListener("plugin:notification", onNotification as EventListener);
    return () => window.removeEventListener("plugin:notification", onNotification as EventListener);
  }, []);

  useEffect(() => {
    const key = `${pluginId}:${page ?? ""}`;
    if (loadedKey.current === key) return;
    loadedKey.current = key;

    let cancelled = false;

    (async () => {
      try {
        const plugin: IPlugin = await pluginRegistry.fetchPlugin(pluginId);

        if (plugin.status !== "ACTIVE") {
          throw new Error(`Plugin "${plugin.name}" is not active (status: ${plugin.status}).`);
        }

        // Resolve the requested page (or the first declared page).
        const pages = plugin.contributions?.pages ?? [];
        const target = page ? pages.find((p) => p.path === page) : pages[0];
        const exportName = target?.component || "default";
        const title = target?.title || plugin.name;

        // Initialize the SDK before executing the bundle so window.PluginSDK is ready.
        initializeSDK({ baseUrl: window.location.origin, pluginId });

        const url = pluginRegistry.resolveAssetUrl(plugin);
        // Carrega o bundle compartilhando o React do host (hooks funcionam).
        const mod = (await loadPluginModule(url)) as PluginModule;

        if (cancelled) return;

        const candidate = (mod[exportName] ?? mod.default) as unknown;
        if (typeof candidate !== "function") {
          throw new Error(`Plugin bundle must export "${exportName}" as a React component.`);
        }

        setState({ phase: "ready", Component: candidate as ComponentType<Record<string, unknown>>, title, slug: plugin.slug });
      } catch (e: any) {
        if (!cancelled) setState({ phase: "error", message: e?.message ?? "Failed to load plugin." });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pluginId, page]);

  if (state.phase === "loading") return <PluginSkeleton />;
  if (state.phase === "error") return <PluginErrorFallback message={state.message} pluginId={pluginId} />;

  const { Component } = state;
  return (
    <React.Suspense fallback={<PluginSkeleton />}>
      <PluginErrorBoundary pluginId={pluginId}>
        <Component {...props} />
      </PluginErrorBoundary>
      {/* G5 — host bridge for SDK modal/drawer/confirm + navigation. */}
      <PluginUiBridge pluginId={pluginId} pluginSlug={state.slug} />
    </React.Suspense>
  );
};

// O carregamento do bundle (com compartilhamento do React do host) vive em
// @/lib/plugin-module-runtime → loadPluginModule.

// ── Sub-components ────────────────────────────────────────────────────────────

const PluginSkeleton: React.FC = () => (
  <div className="animate-pulse rounded-xl bg-custom-background-80" style={{ minHeight: 240 }} />
);

const PluginErrorFallback: React.FC<{ message: string; pluginId: string }> = ({ message, pluginId }) => (
  <div className="flex flex-col items-center justify-center rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
    <p className="text-sm font-medium text-red-500">Plugin failed to load</p>
    <p className="mt-1 text-xs text-red-400">{message}</p>
    <p className="mt-2 font-mono text-xs text-custom-text-400">id: {pluginId}</p>
  </div>
);

class PluginErrorBoundary extends React.Component<
  { pluginId: string; children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { pluginId: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: "" };
  }

  static getDerivedStateFromError(e: Error) {
    return { hasError: true, error: e.message };
  }

  render() {
    if (this.state.hasError) {
      return <PluginErrorFallback message={this.state.error} pluginId={this.props.pluginId} />;
    }
    return this.props.children;
  }
}
