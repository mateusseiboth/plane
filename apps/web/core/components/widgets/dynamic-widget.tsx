"use client";

import React, { useEffect, useRef, useState, type ComponentType } from "react";
import { initializeSDK } from "@mateusseiboth/widgets-aviao";
import { widgetRegistry } from "@/services/widget-registry.service";

interface DynamicWidgetProps {
  widgetId: string;
  props?: Record<string, unknown>;
}

type WidgetModule = { default: ComponentType<Record<string, unknown>> };

type State =
  | { phase: "loading" }
  | { phase: "ready"; Component: ComponentType<Record<string, unknown>> }
  | { phase: "error"; message: string };

export const DynamicWidget: React.FC<DynamicWidgetProps> = ({ widgetId, props = {} }) => {
  const [state, setState] = useState<State>({ phase: "loading" });
  const loadedId = useRef<string | null>(null);

  useEffect(() => {
    if (loadedId.current === widgetId) return;
    loadedId.current = widgetId;

    let cancelled = false;

    (async () => {
      try {
        const widget = await widgetRegistry.fetchWidget(widgetId);

        if (widget.status !== "ACTIVE") {
          throw new Error(`Widget "${widget.name}" is not active (status: ${widget.status}).`);
        }

        // O SDK é parte do projeto web — inicializa com o widgetId antes de executar o bundle
        initializeSDK({
          baseUrl: window.location.origin,
          widgetId,
        });

        const url = widgetRegistry.resolveAssetUrl(widget);
        const mod = (await loadModule(url)) as WidgetModule;

        if (cancelled) return;
        if (!mod?.default || typeof mod.default !== "function") {
          throw new Error("Widget bundle must export a default React component.");
        }

        setState({ phase: "ready", Component: mod.default });
      } catch (e: any) {
        if (!cancelled) setState({ phase: "error", message: e?.message ?? "Failed to load widget." });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [widgetId]);

  if (state.phase === "loading") return <WidgetSkeleton />;
  if (state.phase === "error") return <WidgetErrorFallback message={state.message} widgetId={widgetId} />;

  const { Component } = state;
  return (
    <React.Suspense fallback={<WidgetSkeleton />}>
      <WidgetErrorBoundary widgetId={widgetId}>
        <Component {...props} />
      </WidgetErrorBoundary>
    </React.Suspense>
  );
};

// ── Carrega o bundle do widget via script tag ESM ─────────────────────────────

function loadModule(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const callbackName = `__widget_cb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    (window as any)[callbackName] = (mod: unknown) => {
      delete (window as any)[callbackName];
      resolve(mod);
    };

    const script = document.createElement("script");
    script.type = "module";
    script.textContent = `
      import * as mod from ${JSON.stringify(url)};
      window[${JSON.stringify(callbackName)}](mod);
    `;
    script.onerror = () => {
      delete (window as any)[callbackName];
      reject(new Error(`Falha ao carregar o bundle do widget: ${url}`));
    };
    document.head.appendChild(script);
    script.addEventListener("load", () => script.remove(), { once: true });
  });
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

const WidgetSkeleton: React.FC = () => (
  <div className="animate-pulse rounded-xl bg-custom-background-80" style={{ minHeight: 120 }} />
);

const WidgetErrorFallback: React.FC<{ message: string; widgetId: string }> = ({ message, widgetId }) => (
  <div className="flex flex-col items-center justify-center rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
    <p className="text-sm font-medium text-red-500">Widget failed to load</p>
    <p className="mt-1 text-xs text-red-400">{message}</p>
    <p className="mt-2 font-mono text-xs text-custom-text-400">id: {widgetId}</p>
  </div>
);

class WidgetErrorBoundary extends React.Component<
  { widgetId: string; children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { widgetId: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: "" };
  }

  static getDerivedStateFromError(e: Error) {
    return { hasError: true, error: e.message };
  }

  render() {
    if (this.state.hasError) {
      return <WidgetErrorFallback message={this.state.error} widgetId={this.props.widgetId} />;
    }
    return this.props.children;
  }
}
