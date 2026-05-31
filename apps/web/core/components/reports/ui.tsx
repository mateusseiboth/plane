/**
 * Componentes de UI reutilizáveis pelos relatórios: KPIs, listas-barra, tabelas
 * e títulos de seção. Estilo alinhado ao restante do app (tokens surface e subtle).
 */
import type { ReactNode } from "react";
import { cn } from "@plane/utils";

// ── KPI Card ──────────────────────────────────────────────────────────────────
export function KpiCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: "default" | "green" | "red" | "amber" | "blue";
}) {
  const accentClass =
    accent === "green"
      ? "text-green-600"
      : accent === "red"
        ? "text-red-600"
        : accent === "amber"
          ? "text-amber-600"
          : accent === "blue"
            ? "text-blue-600"
            : "text-primary";
  return (
    <div className="rounded-lg border border-subtle bg-surface-1 px-4 py-3">
      <p className="text-12 text-secondary">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold leading-tight", accentClass)}>{value}</p>
      {hint && <p className="mt-0.5 text-11 text-tertiary">{hint}</p>}
    </div>
  );
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{children}</div>;
}

// ── Section title ──────────────────────────────────────────────────────────────
export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-3 mt-6 flex items-baseline justify-between">
      <h3 className="text-14 font-semibold text-primary">{children}</h3>
      {hint && <span className="text-11 text-tertiary">{hint}</span>}
    </div>
  );
}

// ── Bar list (distribuição horizontal) ──────────────────────────────────────────
export type BarItem = { label: string; value: number; color?: string; sub?: string };

export function BarList({ items, unit }: { items: BarItem[]; unit?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <EmptyHint />;
  return (
    <div className="space-y-2">
      {items.map((item, idx) => (
        <div key={idx} className="flex items-center gap-3">
          <div className="w-44 shrink-0 truncate text-12 text-secondary" title={item.label}>
            {item.label}
            {item.sub && <span className="ml-1 text-tertiary">· {item.sub}</span>}
          </div>
          <div className="relative h-5 flex-1 overflow-hidden rounded bg-surface-2">
            <div
              className="h-full rounded"
              style={{
                width: `${(item.value / max) * 100}%`,
                backgroundColor: item.color ?? "var(--color-primary, #3b82f6)",
                minWidth: item.value > 0 ? "2px" : 0,
              }}
            />
          </div>
          <div className="w-16 shrink-0 text-right text-12 font-medium tabular-nums">
            {item.value}
            {unit ? ` ${unit}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tabela ───────────────────────────────────────────────────────────────────
export type Column<T> = {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  render?: (row: T) => ReactNode;
};

export function ReportTable<T extends Record<string, any>>({
  columns,
  rows,
  emptyLabel,
}: {
  columns: Column<T>[];
  rows: T[];
  emptyLabel?: string;
}) {
  if (!rows.length) return <EmptyHint label={emptyLabel} />;
  return (
    <div className="overflow-x-auto rounded-lg border border-subtle">
      <table className="w-full border-collapse text-12">
        <thead>
          <tr className="border-b border-subtle bg-surface-2 text-secondary">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "px-3 py-2 font-medium",
                  c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-subtle last:border-0 hover:bg-surface-2/50">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    "px-3 py-2 tabular-nums",
                    c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"
                  )}
                >
                  {c.render ? c.render(row) : (row[c.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyHint({ label }: { label?: string }) {
  return <p className="rounded-lg border border-dashed border-subtle px-4 py-6 text-center text-12 text-tertiary">{label ?? "Sem dados para o período/filtros selecionados."}</p>;
}

// ── Palette helper para barras de distribuição ───────────────────────────────
export const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#22c55e",
  none: "#94a3b8",
};

export const CHART_PALETTE = ["#3b82f6", "#8b5cf6", "#ec4899", "#f97316", "#22c55e", "#06b6d4", "#eab308", "#64748b"];

export function fmtDays(v: number | null | undefined) {
  if (v === null || v === undefined) return "—";
  return `${v} d`;
}
export function fmtHours(v: number | null | undefined) {
  if (v === null || v === undefined) return "—";
  return `${v} h`;
}
