/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { cn } from "@plane/utils";

type SectionProps = {
  title: string;
  children: React.ReactNode;
  className?: string;
};

/** Bloco titulado dentro de um documento de impressão. */
export const PrintSection = function PrintSection(props: SectionProps) {
  const { title, children, className } = props;

  return (
    <section className={cn("print-avoid-break mt-4", className)}>
      <h2 className="mb-1 border-b border-neutral-200 pb-0.5 text-xs font-semibold uppercase tracking-wide">{title}</h2>
      <div className="text-[11px] leading-snug">{children}</div>
    </section>
  );
};

type FieldsProps = {
  items: { label: string; value: React.ReactNode }[];
  columns?: 2 | 3;
};

/** Grade de pares rótulo/valor usada para as propriedades de um registro. */
export const PrintFields = function PrintFields(props: FieldsProps) {
  const { items, columns = 3 } = props;

  return (
    <dl className={cn("grid gap-x-6 gap-y-1", columns === 2 ? "grid-cols-2" : "grid-cols-3")}>
      {items.map((item) => (
        <div key={item.label} className="flex flex-col">
          <dt className="text-[9px] font-semibold uppercase tracking-wide text-neutral-500">{item.label}</dt>
          <dd className="text-[11px]">{item.value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
};
