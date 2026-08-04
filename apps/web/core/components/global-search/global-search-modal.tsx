"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { useParams, useRouter } from "next/navigation";
import { Search, X, FileText, Inbox, ArrowUpRight } from "lucide-react";
import { cn } from "@plane/utils";
import { WorkspaceService } from "@/services/workspace.service";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const workspaceService = new WorkspaceService();

const CATEGORY_LABEL: Record<string, string> = {
  "Work Items": "Chamados",
  Intakes: "Solicitações",
};

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "text-red-600 bg-red-50",
  high: "text-orange-600 bg-orange-50",
  medium: "text-yellow-600 bg-yellow-50",
  low: "text-blue-600 bg-blue-50",
  none: "text-gray-500 bg-gray-50",
};

type SearchResult = {
  id: string;
  name: string;
  type: "issue" | "intake";
  sequence_id?: number | null;
  legacy_ticket_number?: string | null;
  priority?: string | null;
  state?: { name: string; group: string } | null;
  project?: { id: string; identifier: string; name: string } | null;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export function GlobalSearchModal({ isOpen, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ issues: SearchResult[]; intakes: SearchResult[] }>({ issues: [], intakes: [] });
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { workspaceSlug } = useParams();
  const router = useRouter();
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults({ issues: [], intakes: [] });
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!debouncedQuery.trim() || !workspaceSlug) {
      setResults({ issues: [], intakes: [] });
      return;
    }
    setLoading(true);
    workspaceService
      .globalSearch(workspaceSlug.toString(), debouncedQuery)
      .then((r) => setResults({ issues: r.issues ?? [], intakes: r.intakes ?? [] }))
      .finally(() => setLoading(false));
  }, [debouncedQuery, workspaceSlug]);

  const allResults: Array<SearchResult & { _category: string }> = [
    ...results.issues.map((i) => ({ ...i, _category: "Work Items" })),
    ...results.intakes.map((i) => ({ ...i, _category: "Intakes" })),
  ];

  const navigate = useCallback(
    (item: SearchResult) => {
      const slug = workspaceSlug?.toString();
      if (item.type === "intake") {
        router.push(`/${slug}/global-intake/?projectId=${item.project?.id}&inboxIssueId=${item.id}`);
      } else {
        // Work item — use browse/[PROJ-SEQ] pattern OR peek in project
        router.push(`/${slug}/projects/${item.project?.id}/issues/${item.id}/`);
      }
      onClose();
    },
    [workspaceSlug, router, onClose]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, allResults.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
      if (e.key === "Enter" && allResults[selected]) navigate(allResults[selected]);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, allResults, selected, navigate]);

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child as={Fragment} enter="ease-out duration-150" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
          <div className="fixed inset-0 bg-black/50" />
        </Transition.Child>
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-start justify-center pt-[15vh] px-4">
            <Transition.Child as={Fragment} enter="ease-out duration-150" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-100" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
              <Dialog.Panel className="w-full max-w-2xl overflow-hidden rounded-2xl bg-surface-1 shadow-2xl">
                {/* Search input */}
                <div className="flex items-center gap-3 border-b border-subtle px-4 py-3">
                  <Search className="h-5 w-5 shrink-0 text-secondary" />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
                    placeholder="Buscar work items, intakes, chamados legados… (#1234-2026)"
                    className="flex-1 bg-transparent text-15 text-primary outline-none placeholder:text-tertiary"
                  />
                  {loading && <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />}
                  {query && !loading && (
                    <button onClick={() => setQuery("")} className="text-tertiary hover:text-primary">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  <kbd className="hidden rounded border border-subtle px-1.5 py-0.5 text-11 text-tertiary sm:block">Esc</kbd>
                </div>

                {/* Results */}
                <div className="max-h-[60vh] overflow-y-auto p-2">
                  {!query && (
                    <p className="px-4 py-6 text-center text-13 text-secondary">
                      Digite para buscar work items, intakes, chamados legados ou identificadores de projeto.
                    </p>
                  )}
                  {query && !loading && allResults.length === 0 && (
                    <p className="px-4 py-6 text-center text-13 text-secondary">
                      Nenhum resultado encontrado para &ldquo;{query}&rdquo;
                    </p>
                  )}

                  {/* Group by category */}
                  {["Work Items", "Intakes"].map((category) => {
                    const items = allResults.filter((r) => r._category === category);
                    if (items.length === 0) return null;
                    const baseIdx = allResults.findIndex((r) => r._category === category);
                    return (
                      <div key={category} className="mb-2">
                        <div className="flex items-center gap-2 px-3 py-1.5">
                          {category === "Intakes" ? <Inbox className="h-3.5 w-3.5 text-tertiary" /> : <FileText className="h-3.5 w-3.5 text-tertiary" />}
                          <span className="text-11 font-semibold uppercase tracking-wider text-tertiary">
                            {CATEGORY_LABEL[category] ?? category}
                          </span>
                          <span className="rounded-full bg-surface-2 px-1.5 text-10 font-medium text-tertiary">{items.length}</span>
                        </div>
                        {items.map((item, idx) => {
                          const globalIdx = baseIdx + idx;
                          return (
                            <button
                              key={item.id}
                              onClick={() => navigate(item)}
                              onMouseEnter={() => setSelected(globalIdx)}
                              className={cn(
                                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                                globalIdx === selected ? "bg-accent-primary/10" : "hover:bg-surface-2"
                              )}
                            >
                              {/* Work item identifier (e.g. SIARTW-32) */}
                              {item.project?.identifier && item.sequence_id != null && (
                                <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-10 font-mono font-semibold text-secondary">
                                  {item.project.identifier}-{item.sequence_id}
                                </span>
                              )}

                              {/* Legacy ticket badge */}
                              {item.legacy_ticket_number && (
                                <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-10 font-mono font-semibold text-amber-800 ring-1 ring-amber-300">
                                  #{item.legacy_ticket_number}
                                </span>
                              )}

                              {/* Priority indicator */}
                              {item.priority && item.priority !== "none" && (
                                <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-10 font-semibold", PRIORITY_COLOR[item.priority] ?? "")}>
                                  {item.priority.toUpperCase()}
                                </span>
                              )}

                              {/* Name */}
                              <span className="flex-1 truncate text-13 text-primary">{item.name}</span>

                              {/* State */}
                              {item.state && (
                                <span className="shrink-0 text-11 text-tertiary">{item.state.name}</span>
                              )}

                              {/* Project name */}
                              {item.project && (
                                <span className="max-w-40 shrink-0 truncate text-11 text-tertiary">{item.project.name}</span>
                              )}

                              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-tertiary opacity-0 group-hover:opacity-100" />
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>

                {/* Footer hint */}
                <div className="flex items-center gap-4 border-t border-subtle px-4 py-2">
                  <span className="text-11 text-tertiary">↑↓ navegar</span>
                  <span className="text-11 text-tertiary">↵ abrir</span>
                  <span className="text-11 text-tertiary">Esc fechar</span>
                  <span className="ml-auto text-11 text-tertiary">Busca com tolerância a erros habilitada</span>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
