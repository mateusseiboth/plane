/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Copy, Download, Mail } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// components
import { SelectPesquisavel } from "@/components/common/select-pesquisavel";
import { PageHead } from "@/components/core/page-title";
import { ENTITY_TYPES } from "@/components/entities/entity-form-modal";
import { AvisoDaPagina, CabecalhoDaPagina, botaoPrimario, botaoSecundario } from "@/components/ouvidoria/comum";
import { formatEmailsParaCopiar, type TContatoEmailFiltros } from "@/components/ouvidoria/helpers";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useEntities } from "@/hooks/use-entities";
import { useListaDeEmails, useOuvidoriaPermissoes } from "@/hooks/use-ouvidoria";

const FILTROS_VAZIOS: TContatoEmailFiltros = { entityId: "", entityType: "", projectIds: [], isWithMembers: false };

const TIPOS = ENTITY_TYPES.map((t) => ({ value: String(t.value), label: t.label }));

function ListaDeEmailsPage() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { currentWorkspace } = useWorkspace();
  const { canExportContatos, isLoading: isLoadingPermissoes } = useOuvidoriaPermissoes(slug);
  const { entities } = useEntities(canExportContatos ? slug : undefined);
  const { workspaceProjectIds, getProjectById } = useProject();
  const [filtros, setFiltros] = useState<TContatoEmailFiltros>(FILTROS_VAZIOS);
  const [gerada, setGerada] = useState<TContatoEmailFiltros | null>(null);
  const { data, error, isLoading, csvUrl } = useListaDeEmails(slug, gerada);

  const sistemas = (workspaceProjectIds ?? [])
    .map((id) => getProjectById(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({ id: p.id, name: p.name }));
  const entidades = (entities ?? []).map((e) => ({ value: e.id, label: e.name }));
  const texto = formatEmailsParaCopiar(data?.emails ?? []);

  const toggleSistema = (id: string) =>
    setFiltros((f) => ({
      ...f,
      projectIds: f.projectIds.includes(id) ? f.projectIds.filter((p) => p !== id) : [...f.projectIds, id],
    }));

  const onCopiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Copiado", message: `${data?.total ?? 0} e-mails copiados.` });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Erro",
        message: "Não foi possível copiar. Selecione a lista e copie.",
      });
    }
  };

  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - Lista de e-mails` : "Lista de e-mails";

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <PageHead title={pageTitle} />
      <CabecalhoDaPagina
        icone={<Mail className="h-5 w-5 text-secondary" />}
        titulo="Lista de e-mails dos responsáveis"
      />

      {!isLoadingPermissoes && !canExportContatos && (
        <div className="p-6">
          <AvisoDaPagina>Você não tem permissão para gerar a lista de e-mails.</AvisoDaPagina>
        </div>
      )}

      {canExportContatos && (
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <div className="flex flex-wrap items-center gap-3">
            <SelectPesquisavel
              value={filtros.entityId}
              onChange={(valor) => setFiltros((f) => ({ ...f, entityId: valor }))}
              opcoes={entidades}
              opcaoVazia={{ value: "", label: "Todas as entidades" }}
              placeholder="Entidade"
              searchable
              searchPlaceholder="Buscar entidade"
              className="w-64"
            />
            <SelectPesquisavel
              value={filtros.entityType}
              onChange={(valor) => setFiltros((f) => ({ ...f, entityType: valor }))}
              opcoes={TIPOS}
              opcaoVazia={{ value: "", label: "Todos os tipos de entidade" }}
              placeholder="Tipo de entidade"
              className="w-56"
            />
            <label className="flex items-center gap-1.5 text-13">
              <input
                type="checkbox"
                checked={filtros.isWithMembers}
                onChange={(e) => setFiltros((f) => ({ ...f, isWithMembers: e.target.checked }))}
              />
              Incluir usuários internos
            </label>
          </div>

          <fieldset className="rounded-lg border border-subtle p-3">
            <legend className="px-1 text-12 text-secondary">Sistemas (nenhum marcado = todos)</legend>
            <div className="flex max-h-40 flex-wrap gap-x-4 gap-y-1 overflow-y-auto">
              {sistemas.map((s) => (
                <label key={s.id} className="flex items-center gap-1.5 text-13">
                  <input
                    type="checkbox"
                    checked={filtros.projectIds.includes(s.id)}
                    onChange={() => toggleSistema(s.id)}
                  />
                  {s.name}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={botaoPrimario} onClick={() => setGerada({ ...filtros })}>
              Gerar lista
            </button>
            <button type="button" className={botaoSecundario} onClick={() => void onCopiar()} disabled={!texto}>
              <Copy className="h-3.5 w-3.5" />
              Copiar lista
            </button>
            {csvUrl && (
              <a href={csvUrl} className={botaoSecundario}>
                <Download className="h-3.5 w-3.5" />
                Exportar CSV
              </a>
            )}
            <button
              type="button"
              className={botaoSecundario}
              onClick={() => {
                setFiltros(FILTROS_VAZIOS);
                setGerada(null);
              }}
            >
              Limpar
            </button>
          </div>

          <p className="text-12 text-secondary">
            Só entram responsáveis ativos que aceitam receber mensagens. Coloque os e-mails em cópia oculta (CCO).
          </p>

          {error && <AvisoDaPagina>Não foi possível gerar a lista. Tente de novo em instantes.</AvisoDaPagina>}
          {isLoading && <div className="h-24 animate-pulse rounded-lg border border-subtle bg-surface-2" />}
          {data && (
            <div className="space-y-1">
              <p className="text-13 font-medium">
                {data.total} {data.total === 1 ? "e-mail" : "e-mails"}
              </p>
              <textarea
                readOnly
                aria-label="Lista de e-mails"
                value={texto}
                rows={8}
                className="w-full rounded border border-subtle bg-surface-2 p-3 text-13"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default observer(ListaDeEmailsPage);
