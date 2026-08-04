/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { cn, getFileURL } from "@plane/utils";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
// local imports
import { usePrintSettings } from "./use-print-settings";

export type TPrintMetaItem = {
  label: string;
  value: string | null | undefined;
};

type Props = {
  title: string;
  subtitle?: string | null;
  meta?: TPrintMetaItem[];
  className?: string;
};

const formatGeneratedAt = () => new Date().toLocaleString("pt-BR");

/**
 * Cabeçalho padrão de qualquer documento impresso: logo configurável do
 * workspace, título, subtítulo, metadados (filtros aplicados, período…) e a
 * data/hora de geração.
 */
export const PrintHeader = observer(function PrintHeader(props: Props) {
  const { title, subtitle, meta, className } = props;
  const { printSettings } = usePrintSettings();
  const { currentWorkspace } = useWorkspace();

  const logoUrl = printSettings.logo_url ? getFileURL(printSettings.logo_url) : undefined;
  const organizationName = printSettings.header_text ?? currentWorkspace?.name ?? "";
  const metaItems = (meta ?? []).filter((item) => !!item.value);

  return (
    <header className={cn("print-avoid-break mb-5 border-b border-neutral-300 pb-3", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {logoUrl && <img src={logoUrl} alt={organizationName} className="h-12 max-w-[180px] object-contain" />}
          <div className="flex flex-col gap-0.5">
            {organizationName && <p className="text-sm font-semibold">{organizationName}</p>}
            <h1 className="text-lg font-bold leading-tight">{title}</h1>
            {subtitle && <p className="text-xs">{subtitle}</p>}
          </div>
        </div>
        {printSettings.show_generated_at && (
          <p className="shrink-0 text-right text-[10px]">Gerado em {formatGeneratedAt()}</p>
        )}
      </div>
      {metaItems.length > 0 && (
        <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[10px]">
          {metaItems.map((item) => (
            <div key={item.label} className="flex gap-1">
              <dt className="font-semibold">{item.label}:</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
});
