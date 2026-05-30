import React, { useCallback, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { Building2, Search, X, ChevronDown } from "lucide-react";
import { cn } from "@plane/utils";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import entityService, { type TEntity, entityTypeLabel } from "@/services/entity.service";
import type { TIssueOperations } from "./root";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  disabled?: boolean;
  className?: string;
};

export const IssueEntitySelect = observer(function IssueEntitySelect({
  workspaceSlug,
  projectId,
  issueId,
  issueOperations,
  disabled = false,
  className,
}: Props) {
  const {
    issue: { getIssueById },
  } = useIssueDetail();

  const issue = getIssueById(issueId);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [entities, setEntities] = useState<TEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentEntityId = (issue as any)?.entity_id as string | null | undefined;
  const currentEntity = entities.find((e) => e.id === currentEntityId);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    entityService
      .list(workspaceSlug)
      .then(setEntities)
      .finally(() => setLoading(false));
  }, [open, workspaceSlug]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleSelect = useCallback(
    async (entityId: string | null) => {
      setOpen(false);
      setSearch("");
      await issueOperations.update(workspaceSlug, projectId, issueId, { entity_id: entityId } as any);
    },
    [workspaceSlug, projectId, issueId, issueOperations]
  );

  const filtered = entities.filter((e) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      e.name.toLowerCase().includes(s) ||
      (e.city ?? "").toLowerCase().includes(s) ||
      entityTypeLabel(e.entity_type).toLowerCase().includes(s)
    );
  });

  return (
    <div ref={dropdownRef} className={cn("relative w-full", className)}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded px-2 py-1 text-body-xs-regular h-7.5",
          "text-left hover:bg-primary-background-90 transition-colors",
          disabled && "cursor-not-allowed opacity-60",
          currentEntity ? "" : "text-placeholder"
        )}
      >
        <Building2 className="h-3.5 w-3.5 shrink-0 text-secondary-text" />
        <span className="grow truncate">
          {currentEntity ? currentEntity.name : "Adicionar entidade"}
        </span>
        {currentEntity && !disabled && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); handleSelect(null); }}
            className="shrink-0 rounded-full hover:bg-primary-background-80 p-0.5"
          >
            <X className="h-3 w-3" />
          </span>
        )}
        {!currentEntity && <ChevronDown className="h-3 w-3 shrink-0 text-secondary-text" />}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[240px] overflow-hidden rounded-md border border-primary-border bg-primary-background shadow-md">
          <div className="flex items-center gap-2 border-b border-primary-border px-2 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-secondary-text" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar entidade..."
              className="w-full bg-transparent text-body-xs-regular outline-none placeholder:text-placeholder"
            />
          </div>

          <div className="max-h-48 overflow-y-auto py-1">
            {loading && (
              <div className="px-3 py-2 text-body-xs-regular text-secondary-text">Carregando...</div>
            )}

            {!loading && filtered.length === 0 && (
              <div className="px-3 py-2 text-body-xs-regular text-secondary-text">Nenhuma entidade encontrada.</div>
            )}

            {!loading && currentEntityId && (
              <button
                type="button"
                onClick={() => handleSelect(null)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-body-xs-regular text-secondary-text hover:bg-primary-background-90"
              >
                <X className="h-3 w-3" />
                Remover entidade
              </button>
            )}

            {!loading &&
              filtered.map((entity) => (
                <button
                  key={entity.id}
                  type="button"
                  onClick={() => handleSelect(entity.id)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-body-xs-regular hover:bg-primary-background-90",
                    entity.id === currentEntityId && "bg-primary-background-80 font-medium"
                  )}
                >
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-secondary-text" />
                  <div className="min-w-0 grow">
                    <p className="truncate">{entity.name}</p>
                    {(entity.city || entity.entity_type != null) && (
                      <p className="truncate text-secondary-text text-body-2xs-regular">
                        {[entityTypeLabel(entity.entity_type), entity.city].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
});
