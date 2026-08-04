/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useParams } from "next/navigation";
// components
import { PageHead } from "@/components/core/page-title";

// ── Small presentational helpers ──────────────────────────────────────────────

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 flex flex-col gap-3">
      <h2 className="text-20 font-semibold text-custom-text-100">{title}</h2>
      <div className="flex flex-col gap-3 text-14 leading-relaxed text-custom-text-200">{children}</div>
    </section>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-custom-border-200 bg-custom-background-90 p-3 text-12 leading-relaxed text-custom-text-200">
      <code>{children}</code>
    </pre>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <code className="mr-1 inline-block rounded bg-custom-background-80 px-1.5 py-0.5 text-12 text-custom-text-200">
      {children}
    </code>
  );
}

const PERMISSIONS = [
  ["worker-items.read", "Listar e ler work items / chamados"],
  ["intakes.read", "Listar solicitações"],
  ["actions.read", "Ler o histórico de ações/atividades"],
  ["stats.read", "Ler estatísticas agregadas e relatórios"],
  ["users.read", "Listar membros do workspace"],
  ["entities.read", "Listar entidades (clientes)"],
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WidgetDocsPage() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";

  return (
    <>
      <PageHead title="Widgets & Integrações — Documentação" />
      <div className="h-full w-full overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-10">
          {/* Header */}
          <header className="flex flex-col gap-2">
            <span className="text-12 font-medium uppercase tracking-wider text-custom-primary-100">
              Documentação para desenvolvedores
            </span>
            <h1 className="text-28 font-bold text-custom-text-100">Widgets &amp; Integrações Customizadas</h1>
            <p className="text-14 text-custom-text-200">
              Estenda a plataforma com widgets React embutidos na home e integrações que consomem nossa API em
              TypeScript. Esta página documenta o que adicionamos: o marketplace de widgets, o SDK, as permissões e os
              webhooks/integrações customizadas.
            </p>
          </header>

          {/* TOC */}
          <nav className="flex flex-wrap gap-2 rounded-xl border border-custom-border-200 bg-custom-background-90 p-3 text-13">
            {[
              ["overview", "Visão geral"],
              ["sdk", "SDK"],
              ["create", "Criar um widget"],
              ["manifest", "Manifest & permissões"],
              ["upload", "Upload & aprovação"],
              ["integrations", "Integrações customizadas"],
            ].map(([id, label]) => (
              <a key={id} href={`#${id}`} className="text-custom-primary-100 hover:underline">
                {label}
              </a>
            ))}
          </nav>

          <Section id="overview" title="Visão geral">
            <p>
              Widgets são componentes React isolados, compilados em um único bundle, que rodam na home do workspace e
              consomem dados através do <strong>SDK de widgets</strong>. O fluxo é: você desenvolve e empacota o widget,
              um administrador faz o upload e o ativa, e ele passa a aparecer para os usuários.
            </p>
            <p>
              Diferente do Plane original, este recurso é totalmente <strong>livre de paywall</strong> e roda contra a
              API TypeScript do projeto, com um gateway dedicado que aplica as permissões declaradas no manifest.
            </p>
          </Section>

          <Section id="sdk" title="SDK de widgets">
            <p>
              Instale o pacote do SDK para acessar hooks React e o runtime global{" "}
              <Pill>window.WidgetSDK</Pill>:
            </p>
            <Code>{`npm install @mateusseiboth/widgets-aviao`}</Code>
            <p>Hooks disponíveis (todos respeitam as permissões do manifest):</p>
            <ul className="ml-5 list-disc">
              <li>
                <Pill>useWorkerItems(filters)</Pill> — work items / chamados
              </li>
              <li>
                <Pill>useIntakes(filters)</Pill> — itens de intake
              </li>
              <li>
                <Pill>useStats(params)</Pill> — estatísticas e relatórios
              </li>
              <li>
                <Pill>useUsers()</Pill> / <Pill>useEntities()</Pill> — membros e entidades
              </li>
            </ul>
          </Section>

          <Section id="create" title="Criar um widget">
            <p>1. Crie um projeto Vite em modo biblioteca:</p>
            <Code>{`npm create vite@latest meu-widget -- --template react-ts`}</Code>
            <p>
              2. Configure o <Pill>vite.config.ts</Pill> deixando o React como dependência externa (a plataforma o
              fornece):
            </p>
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
      external: ["react", "react-dom", "react/jsx-runtime"],
    },
  },
});`}</Code>
            <p>
              3. Exporte um componente React como <strong>default export</strong>. Ele recebe props de contexto (por
              exemplo <Pill>entityId</Pill>):
            </p>
            <Code>{`import { useWorkerItems } from "@mateusseiboth/widgets-aviao";

export default function MeuWidget({ entityId }) {
  const { data, loading } = useWorkerItems({ entity_id: entityId });
  if (loading) return <p>Carregando…</p>;
  return (
    <ul>
      {data?.data.map((item) => (
        <li key={item.id}>{item.name}</li>
      ))}
    </ul>
  );
}`}</Code>
          </Section>

          <Section id="manifest" title="Manifest & permissões">
            <p>
              Todo widget declara um <Pill>manifest.json</Pill> com metadados e as permissões que precisa. O gateway só
              libera os dados das permissões declaradas:
            </p>
            <Code>{`{
  "name": "Meu Widget",
  "version": "1.0.0",
  "author": "Seu Nome",
  "entry": "widget.js",
  "permissions": ["worker-items.read", "stats.read"]
}`}</Code>
            <div className="overflow-hidden rounded-xl border border-custom-border-200">
              <table className="w-full text-13">
                <thead className="bg-custom-background-90 text-custom-text-300">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Permissão</th>
                    <th className="px-3 py-2 text-left font-medium">O que libera</th>
                  </tr>
                </thead>
                <tbody>
                  {PERMISSIONS.map(([perm, desc]) => (
                    <tr key={perm} className="border-t border-custom-border-200">
                      <td className="px-3 py-2 align-top">
                        <Pill>{perm}</Pill>
                      </td>
                      <td className="px-3 py-2 text-custom-text-200">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="upload" title="Upload & aprovação">
            <p>Compile e empacote o widget junto do manifest:</p>
            <Code>{`npm run build
zip widget.zip manifest.json -j dist/widget.js`}</Code>
            <p>
              Em seguida, um administrador acessa{" "}
              <a href={`/${slug}/settings/widgets/`} className="text-custom-primary-100 hover:underline">
                Configurações → Widgets
              </a>{" "}
              e faz o upload do <Pill>widget.zip</Pill>. Após a ativação, o widget aparece na home para todos os
              usuários do workspace.
            </p>
          </Section>

          <Section id="integrations" title="Integrações customizadas">
            <p>
              Além dos widgets, a plataforma expõe um módulo de <strong>webhooks/integrações customizadas</strong> para
              reagir a eventos (criação/atualização de chamados, visitas, intakes) e integrar sistemas externos.
              Configure-os em{" "}
              <a href={`/${slug}/settings/webhooks/`} className="text-custom-primary-100 hover:underline">
                Configurações → Webhooks
              </a>
              .
            </p>
            <p>
              Cada integração recebe um payload JSON assinado e pode ser filtrada por tipo de evento. Para detalhes de
              payloads, autenticação por <Pill>X-Api-Key</Pill> e exemplos completos, consulte{" "}
              <Pill>docs/custom-integration-guide.md</Pill> e <Pill>docs/widget-development-guide.md</Pill> no
              repositório.
            </p>
          </Section>

          <footer className="border-t border-custom-border-200 pt-6 text-13 text-custom-text-300">
            Documentação mantida pelo time. Sugestões de melhoria são bem-vindas via pull request.
          </footer>
        </div>
      </div>
    </>
  );
}
