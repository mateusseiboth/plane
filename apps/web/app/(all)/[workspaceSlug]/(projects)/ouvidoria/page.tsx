/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Check, MessageSquareWarning } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// components
import { PageHead } from "@/components/core/page-title";
import {
  AvisoDaPagina,
  CabecalhoDaPagina,
  Paginacao,
  botaoSecundario,
  campoFiltro,
} from "@/components/ouvidoria/comum";
import { buildPaginaCursor, formatDataHora } from "@/components/ouvidoria/helpers";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useOuvidoria, useOuvidoriaPermissoes } from "@/hooks/use-ouvidoria";
// services
import type { TOuvidoria } from "@/services/ouvidoria.service";

const POR_PAGINA = 20;

const TIPOS = [
  { value: "", label: "Todos os tipos" },
  { value: "sugestao", label: "Sugestões" },
  { value: "reclamacao", label: "Reclamações" },
];

const LEITURA = [
  { value: "", label: "Lidas e não lidas" },
  { value: "false", label: "Não lidas" },
  { value: "true", label: "Lidas" },
];

function SituacaoDeLeitura({ item, onMarkLida }: { item: TOuvidoria; onMarkLida: (id: string) => void }) {
  if (item.is_read) {
    return (
      <span className="text-12 text-secondary">
        Lida por {item.read_by?.display_name ?? "alguém"} em {formatDataHora(item.read_at)}
      </span>
    );
  }
  return (
    <button type="button" className={botaoSecundario} onClick={() => onMarkLida(item.id)}>
      <Check className="h-3.5 w-3.5" />
      Marcar como lida
    </button>
  );
}

function OuvidoriaPage() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { currentWorkspace } = useWorkspace();
  const { canReadOuvidoria, isLoading: isLoadingPermissoes } = useOuvidoriaPermissoes(slug);
  const [kind, setKind] = useState("");
  const [read, setRead] = useState("");
  const [pagina, setPagina] = useState(0);
  const { data, error, isLoading, markLida } = useOuvidoria(
    slug,
    { kind, read, cursor: buildPaginaCursor(POR_PAGINA, pagina) },
    canReadOuvidoria
  );

  const setFiltro = (aplicar: () => void) => {
    aplicar();
    setPagina(0);
  };

  const onMarkLida = async (id: string) => {
    try {
      await markLida(id);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "Não foi possível marcar como lida. Tente de novo." });
    }
  };

  const total = data?.total_count ?? 0;
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - Ouvidoria` : "Ouvidoria";

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <PageHead title={pageTitle} />
      <CabecalhoDaPagina
        icone={<MessageSquareWarning className="h-5 w-5 text-secondary" />}
        titulo="Ouvidoria"
        subtitulo={canReadOuvidoria ? `${total} ${total === 1 ? "registro" : "registros"}` : undefined}
      />

      {!isLoadingPermissoes && !canReadOuvidoria && (
        <div className="p-6">
          <AvisoDaPagina>Você não tem permissão para ver a ouvidoria.</AvisoDaPagina>
        </div>
      )}

      {canReadOuvidoria && (
        <>
          <div className="flex flex-wrap items-center gap-3 border-b border-subtle px-6 py-3 text-12">
            <select
              aria-label="Tipo"
              value={kind}
              onChange={(e) => setFiltro(() => setKind(e.target.value))}
              className={campoFiltro}
            >
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Leitura"
              value={read}
              onChange={(e) => setFiltro(() => setRead(e.target.value))}
              className={campoFiltro}
            >
              {LEITURA.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-6">
            {error && <AvisoDaPagina>Não foi possível carregar a ouvidoria. Tente de novo em instantes.</AvisoDaPagina>}
            {isLoading && <div className="h-32 animate-pulse rounded-lg border border-subtle bg-surface-2" />}
            {!isLoading && !error && !data?.results.length && (
              <p className="py-10 text-center text-13 text-secondary">Nenhum registro encontrado.</p>
            )}
            {data?.results.map((item) => (
              <div
                key={item.id}
                className={`rounded-lg border p-4 ${item.is_read ? "border-subtle" : "border-accent-primary/40 bg-accent-primary/5"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <p className="text-13 font-semibold">
                      {item.kind_label} · {item.entity?.name ?? "Entidade não identificada"}
                    </p>
                    <p className="text-12 text-secondary">
                      {item.name}
                      {item.phone ? ` · ${item.phone}` : ""} · {formatDataHora(item.created_at)}
                      {item.protocol ? ` · Protocolo ${item.protocol}` : ""}
                    </p>
                  </div>
                  <SituacaoDeLeitura item={item} onMarkLida={onMarkLida} />
                </div>
                <p className="mt-2 text-13 whitespace-pre-wrap">{item.message}</p>
              </div>
            ))}
            <Paginacao
              pagina={pagina}
              hasPrev={!!data?.prev_page_results}
              hasNext={!!data?.next_page_results}
              onChange={setPagina}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default observer(OuvidoriaPage);
