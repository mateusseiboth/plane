import { useCallback, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Building2, Search, X } from "lucide-react";
import { cn } from "@plane/utils";
import type { TIssue } from "@plane/types";
import entityService, { type TEntity, entityTypeLabel } from "@/services/entity.service";

type Props = {
  issue: TIssue;
  onClose: () => void;
  onChange: (issue: TIssue, data: Partial<TIssue>, updates: any) => void;
  disabled: boolean;
};

export const SpreadsheetEntityColumn = observer(function SpreadsheetEntityColumn({
  issue, onChange, disabled, onClose,
}: Props) {
  const { workspaceSlug } = useParams();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [entities, setEntities] = useState<TEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const entityId = (issue as any).entity_id as string | null | undefined;
  const selectedEntity = entities.find((e) => e.id === entityId);

  useEffect(() => {
    if (!open || !workspaceSlug) return;
    setLoading(true);
    entityService.list(workspaceSlug.toString()).then(setEntities).finally(() => setLoading(false));
  }, [open, workspaceSlug]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false); setSearch(""); onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  const handleSelect = useCallback(
    (id: string | null) => {
      onChange(issue, { entity_id: id } as any, { changed_property: "entity", change_details: id });
      setOpen(false); setSearch(""); onClose();
    },
    [issue, onChange, onClose]
  );

  const filtered = entities.filter((e) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return e.name.toLowerCase().includes(s) || (e.city ?? "").toLowerCase().includes(s);
  });

  return (
    <div ref={dropdownRef} className="relative h-11 border-b-[0.5px] border-subtle">
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={cn(
          "flex h-full w-full items-center gap-1.5 px-page-x text-left text-caption-sm-regular",
          "hover:bg-layer-1 group-[.selected-issue-row]:bg-accent-primary/5",
          disabled && "cursor-not-allowed"
        )}
      >
        <Building2 className="h-3.5 w-3.5 shrink-0 text-secondary" />
        {selectedEntity ? (
          <>
            <span className="grow truncate">{selectedEntity.name}</span>
            {!disabled && (
              <span role="button" onClick={(e) => { e.stopPropagation(); handleSelect(null); }} className="shrink-0 rounded hover:bg-layer-2 p-px">
                <X className="h-2.5 w-2.5" />
              </span>
            )}
          </>
        ) : (
          <span className="text-placeholder">Entidade</span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-200 mt-0.5 w-56 overflow-hidden rounded-md border border-strong bg-surface-1 shadow-lg">
          <div className="flex items-center gap-1.5 border-b border-strong px-2 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-secondary" />
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="w-full bg-transparent text-caption-sm-regular outline-none placeholder:text-secondary" />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {loading && <p className="px-3 py-2 text-caption-sm-regular text-secondary">Carregando...</p>}
            {!loading && filtered.length === 0 && <p className="px-3 py-2 text-caption-sm-regular text-secondary">Nenhuma encontrada.</p>}
            {!loading && entityId && (
              <button type="button" onClick={() => handleSelect(null)} className="flex w-full items-center gap-2 px-3 py-1.5 text-caption-sm-regular text-secondary hover:bg-layer-1">
                <X className="h-3 w-3" /> Remover
              </button>
            )}
            {!loading && filtered.map((e) => (
              <button key={e.id} type="button" onClick={() => handleSelect(e.id)}
                className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left text-caption-sm-regular hover:bg-layer-1", e.id === entityId && "bg-layer-2 font-medium")}
              >
                <Building2 className="h-3.5 w-3.5 shrink-0 text-secondary" />
                <div className="min-w-0">
                  <p className="truncate">{e.name}</p>
                  {e.city && <p className="truncate text-xs text-secondary">{[entityTypeLabel(e.entity_type), e.city].filter(Boolean).join(" · ")}</p>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
