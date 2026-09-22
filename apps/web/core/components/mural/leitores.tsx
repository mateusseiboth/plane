/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { renderFormattedDate, renderFormattedTime } from "@plane/utils";
// hooks
import { useMuralLeitores } from "@/hooks/use-mural";

type Props = { workspaceSlug: string; recadoId: string };

/** Confirmação de leitura: quem leu (com data) e quem ainda não leu. Só para quem publica. */
export function MuralLeitores({ workspaceSlug, recadoId }: Props) {
  const { data, isLoading, error } = useMuralLeitores(workspaceSlug, recadoId, true);

  if (isLoading) return <div className="h-20 animate-pulse rounded border border-subtle bg-surface-2" />;
  if (error || !data) return <p className="text-danger-text text-12">Não foi possível carregar as leituras.</p>;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <p className="mb-1 text-12 font-semibold text-primary">Leram ({data.read.length})</p>
        <ul className="max-h-48 space-y-1 overflow-y-auto">
          {data.read.map((p) => (
            <li key={p.id} className="flex justify-between gap-2 text-12">
              <span className="truncate">{p.display_name}</span>
              <span className="shrink-0 text-tertiary">
                {renderFormattedDate(p.read_at)} {renderFormattedTime(p.read_at)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-1 text-12 font-semibold text-primary">Não leram ({data.unread.length})</p>
        <ul className="max-h-48 space-y-1 overflow-y-auto">
          {data.unread.map((p) => (
            <li key={p.id} className="truncate text-12 text-secondary">
              {p.display_name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
