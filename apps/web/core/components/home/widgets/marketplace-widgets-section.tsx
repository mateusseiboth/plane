"use client";

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { EModalWidth, ModalCore } from "@plane/ui";
import { widgetService, type IWidget } from "@/services/widget.service";
import { DynamicWidget } from "@/components/widgets/dynamic-widget";

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchActiveWidgets() {
  const res = await widgetService.list({ status: "ACTIVE" });
  return res.results ?? [];
}

// ── Section component ─────────────────────────────────────────────────────────

export const MarketplaceWidgetsSection = observer(function MarketplaceWidgetsSection() {
  const [guideOpen, setGuideOpen] = useState(false);

  const { data: widgets, isLoading } = useSWR<IWidget[]>(
    "HOME_MARKETPLACE_WIDGETS",
    fetchActiveWidgets,
    { revalidateOnFocus: false, revalidateIfStale: false }
  );

  // Nothing to show while loading or when there are no active widgets
  if (isLoading || !widgets || widgets.length === 0) return null;

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-custom-text-100">Widgets</span>
            <span className="rounded-full bg-custom-primary-100/10 px-2 py-0.5 text-xs font-medium text-custom-primary-100">
              {widgets.length}
            </span>
          </div>
          <button
            onClick={() => setGuideOpen(true)}
            className="text-xs text-custom-primary-100 hover:underline focus:outline-none"
          >
            Como criar meu widget?
          </button>
        </div>

        {/* Widget grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {widgets.map((widget) => (
            <div
              key={widget.id}
              className="overflow-hidden rounded-xl border border-custom-border-200 bg-custom-background-100 p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium text-custom-text-200">{widget.name}</span>
                <span className="font-mono text-xs text-custom-text-400">v{widget.version}</span>
              </div>
              <DynamicWidget widgetId={widget.id} />
            </div>
          ))}
        </div>
      </div>

      {/* "Como criar meu widget?" guide modal */}
      <ModalCore isOpen={guideOpen} handleClose={() => setGuideOpen(false)} width={EModalWidth.LG}>
        <WidgetDevGuideModal onClose={() => setGuideOpen(false)} />
      </ModalCore>
    </>
  );
});

// ── Quick-start guide modal content ──────────────────────────────────────────

function WidgetDevGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex max-h-[80vh] flex-col">
      {/* Modal header */}
      <div className="flex items-center justify-between border-b border-custom-border-200 px-6 py-4">
        <h2 className="text-base font-semibold text-custom-text-100">Como criar meu widget?</h2>
        <button
          onClick={onClose}
          className="text-custom-text-300 hover:text-custom-text-100 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Modal body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 text-sm text-custom-text-200">

        <Step number={1} title="Crie o projeto do widget">
          <p>Use Vite em Library Mode para compilar seu componente React em um único bundle:</p>
          <Code>{`npm create vite@latest meu-widget -- --template react-ts`}</Code>
        </Step>

        <Step number={2} title="Configure o vite.config.ts">
          <Code>{`export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: "src/index.tsx",
      name: "Widget",
      fileName: () => "widget.js",
      formats: ["es"],
    },
    rollupOptions: {
      // React é provido pela plataforma — não inclua no bundle
      external: ["react", "react-dom", "react/jsx-runtime"],
    },
  },
});`}</Code>
        </Step>

        <Step number={3} title="Implemente o componente">
          <p>
            O arquivo <code className="rounded bg-custom-background-80 px-1">src/index.tsx</code> deve exportar um
            componente React como <strong>default export</strong>:
          </p>
          <Code>{`import { useWorkerItems } from "@mateusseiboth/widgets-aviao";

export default function MeuWidget({ entityId }) {
  const { data, loading } = useWorkerItems({ entity_id: entityId });

  if (loading) return <p>Carregando…</p>;
  return (
    <ul>
      {data?.data.map(item => <li key={item.id}>{item.name}</li>)}
    </ul>
  );
}`}</Code>
        </Step>

        <Step number={4} title="Crie o manifest.json">
          <Code>{`{
  "name": "Meu Widget",
  "version": "1.0.0",
  "author": "Seu Nome",
  "entry": "widget.js",
  "permissions": ["worker-items.read", "stats.read"]
}`}</Code>
          <p className="mt-2">
            Permissões disponíveis:{" "}
            {["worker-items.read", "intakes.read", "actions.read", "stats.read", "users.read", "entities.read"].map(
              (p) => (
                <code key={p} className="mr-1 rounded bg-custom-background-80 px-1 text-xs">
                  {p}
                </code>
              )
            )}
          </p>
        </Step>

        <Step number={5} title="Compile e empacote">
          <Code>{`npm run build
zip widget.zip manifest.json -j dist/widget.js`}</Code>
        </Step>

        <Step number={6} title="Faça o upload">
          <p>
            Acesse{" "}
            <a
              href="/settings/widgets/"
              className="text-custom-primary-100 hover:underline"
              onClick={onClose}
            >
              Administração → Settings → Widgets
            </a>{" "}
            e faça o upload do arquivo <code className="rounded bg-custom-background-80 px-1">widget.zip</code>.
            Após o upload, um administrador pode ativar o widget e ele aparecerá aqui na home.
          </p>
        </Step>

        <div className="rounded-lg border border-custom-primary-100/30 bg-custom-primary-100/5 p-4">
          <p className="font-medium text-custom-primary-100">SDK disponível</p>
          <p className="mt-1">
            Instale <code className="rounded bg-custom-background-80 px-1">@mateusseiboth/widgets-aviao</code> para acessar
            hooks React (<code className="rounded bg-custom-background-80 px-1">useWorkerItems</code>,{" "}
            <code className="rounded bg-custom-background-80 px-1">useStats</code>, etc.) e{" "}
            <code className="rounded bg-custom-background-80 px-1">window.WidgetSDK</code> no runtime.
          </p>
          <p className="mt-2 text-xs text-custom-text-300">
            Documentação completa em{" "}
            <code className="rounded bg-custom-background-80 px-1">docs/widget-development.md</code> no repositório.
          </p>
        </div>
      </div>

      {/* Modal footer */}
      <div className="flex justify-end border-t border-custom-border-200 px-6 py-4">
        <a
          href="/settings/widgets/"
          onClick={onClose}
          className="mr-3 text-sm text-custom-primary-100 hover:underline"
        >
          Gerenciar widgets →
        </a>
        <button
          onClick={onClose}
          className="rounded-lg border border-custom-border-200 px-4 py-1.5 text-sm text-custom-text-200 hover:bg-custom-background-80"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}

// ── Small helper components ───────────────────────────────────────────────────

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-custom-primary-100/15 text-xs font-bold text-custom-primary-100">
        {number}
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="font-medium text-custom-text-100">{title}</p>
        {children}
      </div>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-custom-background-80 p-3 text-xs leading-relaxed text-custom-text-200">
      {children}
    </pre>
  );
}
