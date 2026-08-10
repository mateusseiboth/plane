import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react";
import {
  Puzzle,
  Search,
  Download,
  Trash2,
  ExternalLink,
  Star,
  Package,
  Globe,
  Tag,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { DOCS_URL } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Dialog, EDialogWidth } from "@plane/propel/dialog";
import { PageHead } from "@/components/core/page-title";
import { useWorkspace } from "@/hooks/store/use-workspace";
import type { Route } from "./+types/page";
import {SelectPesquisavel} from "@/components/common/select-pesquisavel";

// ── Plugin types ──────────────────────────────────────────────────────────────

export type TPlugin = {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  authorUrl?: string;
  category: TPluginCategory;
  tags: string[];
  entryUrl?: string;   // for iframe-loaded UI plugins
  apiUrl?: string;     // for webhook/API plugins
  docsUrl?: string;
  iconUrl?: string;
  stars?: number;
  isOfficial?: boolean;
  isInstalled?: boolean;
  installedVersion?: string;
};

type TPluginCategory = "integration" | "automation" | "reporting" | "ui" | "utility" | "ai";

const CATEGORY_LABELS: Record<TPluginCategory, string> = {
  integration: "Integração",
  automation: "Automação",
  reporting: "Relatórios",
  ui: "Interface",
  utility: "Utilitário",
  ai: "Inteligência Artificial",
};

const CATEGORY_COLORS: Record<TPluginCategory, string> = {
  integration: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  automation: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  reporting: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  ui: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  utility: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400",
  ai: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

// ── Built-in plugin registry (community-extensible) ───────────────────────────
// Add new plugins here or fetch from an external registry URL.

const BUILTIN_REGISTRY: TPlugin[] = [
  {
    id: "github-integration",
    name: "GitHub Integration",
    description: "Vincule commits, PRs e issues do GitHub a chamados do Avião. Visualize o status do repositório diretamente no painel.",
    version: "1.0.0",
    author: "Avião Team",
    category: "integration",
    tags: ["github", "vcs", "devops"],
    docsUrl: DOCS_URL,
    stars: 342,
    isOfficial: true,
  },
  {
    id: "slack-notifications",
    name: "Slack Notifications",
    description: "Receba notificações de chamados, comentários e atualizações de status diretamente no Slack.",
    version: "1.2.0",
    author: "Avião Team",
    category: "integration",
    tags: ["slack", "notificações", "comunicação"],
    stars: 218,
    isOfficial: true,
  },
  {
    id: "time-report",
    name: "Relatório de Tempo",
    description: "Gere relatórios detalhados de horas registradas por usuário, projeto e período. Exporta para Excel e PDF.",
    version: "0.9.0",
    author: "Comunidade",
    category: "reporting",
    tags: ["tempo", "relatório", "horas"],
    stars: 89,
  },
  {
    id: "recurring-issues",
    name: "Tarefas Recorrentes",
    description: "Crie chamados que se repetem automaticamente com base em intervalos configuráveis (diário, semanal, mensal).",
    version: "1.1.0",
    author: "Comunidade",
    category: "automation",
    tags: ["recorrente", "automação", "agendamento"],
    stars: 156,
  },
  {
    id: "ai-assistant",
    name: "Assistente de IA",
    description: "Integre modelos de IA (compatíveis com OpenAI e Llama) para sugestões inteligentes de prioridade, categorização automática e resumos de issues.",
    version: "2.0.0",
    author: "Avião Team",
    category: "ai",
    tags: ["ia", "openai", "llama", "automação"],
    stars: 412,
    isOfficial: true,
  },
  {
    id: "entity-dashboard",
    name: "Dashboard de Entidades",
    description: "Visualize métricas agrupadas por entidade (município, prefeitura, câmara). Veja SLAs, tempos de resposta e histórico por cliente.",
    version: "1.0.0",
    author: "Comunidade",
    category: "reporting",
    tags: ["entidade", "dashboard", "cliente"],
    stars: 67,
  },
  {
    id: "bulk-import",
    name: "Importação em Massa",
    description: "Importe chamados de CSV, Excel ou JSON. Suporta mapeamento de campos e importação incremental.",
    version: "1.3.0",
    author: "Comunidade",
    category: "utility",
    tags: ["importação", "csv", "excel"],
    stars: 134,
  },
  {
    id: "kanban-themes",
    name: "Temas do Kanban",
    description: "Personalize cores, fontes e layout do quadro Kanban. Inclui temas escuro, claro e modo de alto contraste.",
    version: "0.5.0",
    author: "Comunidade",
    category: "ui",
    tags: ["kanban", "tema", "visual"],
    stars: 45,
  },
];

// ── Plugin detail modal ───────────────────────────────────────────────────────

function PluginDetailModal({
  plugin,
  open,
  onClose,
  onInstall,
  onUninstall,
  installing,
}: {
  plugin: TPlugin | null;
  open: boolean;
  onClose: () => void;
  onInstall: (plugin: TPlugin) => void;
  onUninstall: (plugin: TPlugin) => void;
  installing: string | null;
}) {
  if (!plugin) return null;
  const isInstalling = installing === plugin.id;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <Dialog.Panel width={EDialogWidth.LG}>
        <div className="p-6">
          <div className="flex items-start gap-4 mb-5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-subtle bg-surface-2">
              {plugin.iconUrl ? (
                <img src={plugin.iconUrl} alt={plugin.name} className="h-10 w-10 rounded" />
              ) : (
                <Puzzle className="h-7 w-7 text-secondary-text" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold">{plugin.name}</h2>
                {plugin.isOfficial && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent-primary/10 px-2 py-0.5 text-xs font-medium text-accent-primary">
                    <CheckCircle className="h-3 w-3" /> Oficial
                  </span>
                )}
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[plugin.category]}`}>
                  {CATEGORY_LABELS[plugin.category]}
                </span>
              </div>
              <p className="text-sm text-secondary-text mt-0.5">por {plugin.author} · v{plugin.version}</p>
            </div>
          </div>

          <p className="text-sm text-primary mb-4">{plugin.description}</p>

          <div className="flex flex-wrap gap-1.5 mb-5">
            {plugin.tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-subtle bg-surface-2 px-2 py-0.5 text-xs text-secondary-text">
                <Tag className="h-2.5 w-2.5" /> {tag}
              </span>
            ))}
          </div>

          {plugin.docsUrl && (
            <a
              href={plugin.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-accent-primary hover:underline mb-5"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Ver documentação
            </a>
          )}

          <div className="flex items-center justify-between border-t border-subtle pt-4">
            {plugin.stars !== undefined && (
              <div className="flex items-center gap-1 text-xs text-secondary-text">
                <Star className="h-3.5 w-3.5" />
                {plugin.stars} estrelas
              </div>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <Button variant="neutral-secondary" size="sm" onClick={onClose}>
                Fechar
              </Button>
              {plugin.isInstalled ? (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => { onUninstall(plugin); onClose(); }}
                  loading={isInstalling}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Desinstalar
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => { onInstall(plugin); onClose(); }}
                  loading={isInstalling}
                >
                  <Download className="mr-1 h-3.5 w-3.5" /> Instalar
                </Button>
              )}
            </div>
          </div>
        </div>
      </Dialog.Panel>
    </Dialog>
  );
}

// ── Plugin card ───────────────────────────────────────────────────────────────

function PluginCard({
  plugin,
  onInstall,
  onUninstall,
  onDetails,
  installing,
}: {
  plugin: TPlugin;
  onInstall: (p: TPlugin) => void;
  onUninstall: (p: TPlugin) => void;
  onDetails: (p: TPlugin) => void;
  installing: string | null;
}) {
  const isInstalling = installing === plugin.id;

  return (
    <div
      className="group relative flex flex-col rounded-lg border border-subtle bg-surface-1 p-4 transition-all hover:border-accent-primary/40 hover:shadow-sm cursor-pointer"
      onClick={() => onDetails(plugin)}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-subtle bg-surface-2">
            {plugin.iconUrl ? (
              <img src={plugin.iconUrl} alt={plugin.name} className="h-7 w-7 rounded" />
            ) : (
              <Puzzle className="h-5 w-5 text-secondary-text" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-medium text-primary">{plugin.name}</p>
              {plugin.isOfficial && (
                <CheckCircle className="h-3.5 w-3.5 text-accent-primary" title="Plugin oficial" />
              )}
            </div>
            <p className="text-xs text-secondary-text">v{plugin.version}</p>
          </div>
        </div>
        {plugin.isInstalled && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400 shrink-0">
            <CheckCircle className="h-3 w-3" /> Instalado
          </span>
        )}
      </div>

      <p className="text-xs text-secondary-text line-clamp-2 mb-3 grow">{plugin.description}</p>

      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[plugin.category]}`}>
          {CATEGORY_LABELS[plugin.category]}
        </span>

        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {plugin.stars !== undefined && (
            <span className="flex items-center gap-0.5 text-xs text-secondary-text">
              <Star className="h-3 w-3" /> {plugin.stars}
            </span>
          )}
          {plugin.isInstalled ? (
            <Button
              variant="neutral-secondary"
              size="sm"
              onClick={() => onUninstall(plugin)}
              loading={isInstalling}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() => onInstall(plugin)}
              loading={isInstalling}
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const PluginsPage = observer(function PluginsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { currentWorkspace } = useWorkspace();

  const [plugins, setPlugins] = useState<TPlugin[]>([]);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<TPluginCategory | "">("");
  const [filterInstalled, setFilterInstalled] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [detailPlugin, setDetailPlugin] = useState<TPlugin | null>(null);

  const load = useCallback(async () => {
    try {
      // Load installed plugins from backend
      const res = await fetch(`/api/workspaces/${workspaceSlug}/plugins/`, { credentials: "include" });
      const installed: string[] = res.ok ? await res.json().then((d: any) => d.installed ?? []) : [];

      // Merge registry with installed state
      setPlugins(
        BUILTIN_REGISTRY.map((p) => ({
          ...p,
          isInstalled: installed.includes(p.id),
        }))
      );
    } catch {
      setPlugins(BUILTIN_REGISTRY);
    }
  }, [workspaceSlug]);

  useEffect(() => { load(); }, [load]);

  const handleInstall = async (plugin: TPlugin) => {
    setInstalling(plugin.id);
    try {
      await fetch(`/api/workspaces/${workspaceSlug}/plugins/${plugin.id}/install/`, {
        method: "POST",
        credentials: "include",
      });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Instalado", message: `${plugin.name} instalado com sucesso.` });
      load();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "Falha ao instalar plugin." });
    } finally {
      setInstalling(null);
    }
  };

  const handleUninstall = async (plugin: TPlugin) => {
    if (!confirm(`Desinstalar ${plugin.name}?`)) return;
    setInstalling(plugin.id);
    try {
      await fetch(`/api/workspaces/${workspaceSlug}/plugins/${plugin.id}/uninstall/`, {
        method: "DELETE",
        credentials: "include",
      });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Desinstalado", message: `${plugin.name} removido.` });
      load();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "Falha ao desinstalar plugin." });
    } finally {
      setInstalling(null);
    }
  };

  const filtered = plugins.filter((p) => {
    if (filterInstalled && !p.isInstalled) return false;
    if (filterCategory && p.category !== filterCategory) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        p.name.toLowerCase().includes(s) ||
        p.description.toLowerCase().includes(s) ||
        p.tags.some((t) => t.includes(s))
      );
    }
    return true;
  });

  const installedCount = plugins.filter((p) => p.isInstalled).length;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHead title={`${currentWorkspace?.name ?? ""} - Loja de plugins`} />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-subtle px-6 py-4">
        <div className="flex items-center gap-3">
          <Puzzle className="h-6 w-6 text-accent-primary" />
          <div>
            <h1 className="text-lg font-semibold">Loja de plugins</h1>
            <p className="text-xs text-secondary-text">
              {installedCount > 0
                ? `${installedCount} plugin(s) instalado(s) · ${plugins.length} disponíveis`
                : `${plugins.length} plugins disponíveis`}
            </p>
          </div>
        </div>
        <a
          href="https://github.com/seu-repo/plane-plugins"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-secondary-text hover:text-primary"
        >
          <Globe className="h-3.5 w-3.5" />
          Publicar um plugin
        </a>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 border-b border-subtle px-6 py-3">
        <div className="flex items-center gap-1.5 rounded-md border border-subtle bg-surface-2 px-2.5 py-1.5 flex-1 min-w-[200px]">
          <Search className="h-3.5 w-3.5 text-secondary-text shrink-0" />
          <input
            className="w-full border-none bg-transparent text-xs outline-none placeholder:text-secondary-text"
            placeholder="Buscar plugins..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <SelectPesquisavel
          value={filterCategory}
          onChange={(valor) => setFilterCategory(valor as TPluginCategory | "")}
          opcoes={Object.entries(CATEGORY_LABELS).map(([k, v]) => ({value: k, label: v as string}))}
          opcaoVazia={{value: "", label: "Todas as categorias"}}
          className="w-48"
          buttonClassName="h-8 text-xs"
        />

        <button
          onClick={() => setFilterInstalled((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors ${
            filterInstalled
              ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
              : "border-subtle bg-surface-2 text-secondary-text hover:text-primary"
          }`}
        >
          <Package className="h-3.5 w-3.5" />
          Instalados
        </button>
      </div>

      {/* Plugin grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <AlertCircle className="h-10 w-10 text-secondary-text mb-3" />
            <p className="text-sm font-medium text-primary">Nenhum plugin encontrado</p>
            <p className="text-xs text-secondary-text mt-1">Tente remover os filtros ou buscar por outro termo.</p>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((plugin) => (
              <PluginCard
                key={plugin.id}
                plugin={plugin}
                onInstall={handleInstall}
                onUninstall={handleUninstall}
                onDetails={setDetailPlugin}
                installing={installing}
              />
            ))}
          </div>
        )}
      </div>

      {/* Plugin detail modal */}
      <PluginDetailModal
        plugin={detailPlugin}
        open={!!detailPlugin}
        onClose={() => setDetailPlugin(null)}
        onInstall={handleInstall}
        onUninstall={handleUninstall}
        installing={installing}
      />
    </div>
  );
});

export default PluginsPage;
