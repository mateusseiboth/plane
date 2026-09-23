"use client";

import React, { useEffect, useRef, useState, type ComponentType } from "react";
import { useParams } from "next/navigation";
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
  // O SDK manda o workspace aberto em toda chamada: o gateway exige workspace_slug.
  const workspaceSlug = useParams().workspaceSlug?.toString();

  useEffect(() => {
    const key = `${widgetId}:${workspaceSlug ?? ""}`;
    if (loadedId.current === key) return;
    loadedId.current = key;

    let cancelled = false;

    (async () => {
      try {
        const widget = await widgetRegistry.fetchWidget(widgetId);

        if (widget.status !== "ACTIVE") {
          throw new Error(`O widget "${widget.name}" está desativado. Peça a um administrador para ativá-lo.`);
        }

        // O SDK é parte do projeto web — inicializa com o widgetId antes de executar o bundle
        initializeSDK({
          baseUrl: window.location.origin,
          widgetId,
          workspaceSlug,
        });

        const url = widgetRegistry.resolveAssetUrl(widget);
        const mod = (await loadModule(url)) as WidgetModule;

        if (cancelled) return;
        if (!mod?.default || typeof mod.default !== "function") {
          throw new Error("O pacote do widget precisa exportar um componente React como default.");
        }

        setState({ phase: "ready", Component: mod.default });
      } catch (e: any) {
        if (!cancelled) setState({ phase: "error", message: e?.message ?? "Falha ao carregar o widget." });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [widgetId, workspaceSlug]);

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
    script.addEventListener(
      "error",
      () => {
        delete (window as any)[callbackName];
        reject(new Error(`Falha ao carregar o bundle do widget: ${url}`));
      },
      { once: true }
    );
    document.head.appendChild(script);
    script.addEventListener("load", () => script.remove(), { once: true });
  });
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

const WidgetSkeleton: React.FC = () => (
  <div aria-hidden className="min-h-30 animate-pulse rounded-xl bg-layer-1 dark:bg-layer-2" />
);

const WidgetErrorFallback: React.FC<{ message: string; widgetId: string }> = ({ message, widgetId }) => (
  <div
    role="alert"
    className="flex flex-col items-center justify-center rounded-xl border border-danger-subtle bg-danger-subtle p-6 text-center"
  >
    <p className="text-13 font-medium text-danger-primary">Não foi possível carregar o widget.</p>
    <p className="mt-1 text-12 text-secondary">{message}</p>
    <p className="font-mono mt-2 text-11 text-tertiary">{widgetId}</p>
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
