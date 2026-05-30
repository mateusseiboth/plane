import { useEffect, useRef, useState } from "react";
import { Building2, ChevronDown, X, Search } from "lucide-react";
import { cn } from "@plane/utils";
import entityService, { type TEntity, entityTypeLabel } from "@/services/entity.service";

type Props = {
  value: string | null | undefined;
  onChange: (entityId: string | null) => void;
  workspaceSlug: string;
  buttonVariant?: "border-with-text" | "transparent-without-text";
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  tabIndex?: number;
};

export function EntityDropdown({
  value,
  onChange,
  workspaceSlug,
  buttonVariant = "border-with-text",
  placeholder = "Entidade",
  disabled = false,
  className,
  tabIndex,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [entities, setEntities] = useState<TEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = entities.find((e) => e.id === value);

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

  const filtered = entities.filter((e) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      e.name.toLowerCase().includes(s) ||
      (e.city ?? "").toLowerCase().includes(s) ||
      entityTypeLabel(e.entity_type).toLowerCase().includes(s)
    );
  });

  const isBorderVariant = buttonVariant === "border-with-text";

  return (
    <div ref={dropdownRef} className={cn("relative h-full", className)}>
      <button
        type="button"
        tabIndex={tabIndex}
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={cn(
          "flex h-full items-center gap-1 rounded text-caption-sm-regular",
          isBorderVariant
            ? "border-[0.5px] border-strong px-2 py-0.5 hover:bg-layer-1"
            : "px-1 hover:bg-layer-1",
          disabled && "cursor-not-allowed opacity-60"
        )}
      >
        <Building2 className="h-3 w-3 shrink-0" />
        {selected ? (
          <>
            <span className="max-w-[120px] truncate">{selected.name}</span>
            {!disabled && (
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); onChange(null); }}
                className="ml-0.5 rounded hover:bg-layer-2 p-px"
              >
                <X className="h-2.5 w-2.5" />
              </span>
            )}
          </>
        ) : (
          <>
            <span className="text-secondary">{placeholder}</span>
            <ChevronDown className="h-3 w-3 shrink-0 text-secondary" />
          </>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[200] mt-1 w-56 overflow-hidden rounded-md border border-strong bg-surface-1 shadow-lg">
          <div className="flex items-center gap-1.5 border-b border-strong px-2 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-secondary" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar entidade..."
              className="w-full bg-transparent text-caption-sm-regular outline-none placeholder:text-secondary"
            />
          </div>

          <div className="max-h-48 overflow-y-auto py-1">
            {loading && (
              <p className="px-3 py-2 text-caption-sm-regular text-secondary">Carregando...</p>
            )}

            {!loading && filtered.length === 0 && (
              <p className="px-3 py-2 text-caption-sm-regular text-secondary">Nenhuma entidade encontrada.</p>
            )}

            {!loading && value && (
              <button
                type="button"
                onClick={() => { onChange(null); setOpen(false); setSearch(""); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-caption-sm-regular text-secondary hover:bg-layer-1"
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
                  onClick={() => { onChange(entity.id); setOpen(false); setSearch(""); }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-caption-sm-regular hover:bg-layer-1",
                    entity.id === value && "bg-layer-2 font-medium"
                  )}
                >
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-secondary" />
                  <div className="min-w-0 grow">
                    <p className="truncate">{entity.name}</p>
                    {(entity.city || entity.entity_type != null) && (
                      <p className="truncate text-secondary text-xs">
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
}
