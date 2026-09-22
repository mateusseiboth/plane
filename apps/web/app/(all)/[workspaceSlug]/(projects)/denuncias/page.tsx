/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// components
import { PageHead } from "@/components/core/page-title";
import { getFieldErrors } from "@/components/mural/helpers";
import { AvisoDaPagina, CabecalhoDaPagina, Paginacao, botaoPrimario } from "@/components/ouvidoria/comum";
import { buildPaginaCursor, formatDia } from "@/components/ouvidoria/helpers";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useDenuncias, useOuvidoriaPermissoes } from "@/hooks/use-ouvidoria";

const POR_PAGINA = 20;

const FORM_VAZIO = { title: "", description: "", is_anonymous: false };

const campoTexto =
  "w-full rounded border border-subtle bg-surface-1 px-3 py-2 text-13 text-primary outline-none focus:border-accent-primary";

function ErroDoCampo({ mensagem }: { mensagem?: string }) {
  return mensagem ? <p className="text-red-500 mt-1 text-12">{mensagem}</p> : null;
}

function DenunciasPage() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { currentWorkspace } = useWorkspace();
  const { canReadDenuncias } = useOuvidoriaPermissoes(slug);
  const [pagina, setPagina] = useState(0);
  const { data, error, isLoading, create } = useDenuncias(
    slug,
    buildPaginaCursor(POR_PAGINA, pagina),
    canReadDenuncias
  );
  const [form, setForm] = useState(FORM_VAZIO);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [isEnviando, setIsEnviando] = useState(false);

  const onSubmit = async () => {
    setIsEnviando(true);
    setErros({});
    try {
      await create(form);
      setForm(FORM_VAZIO);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Denúncia enviada",
        message: "Obrigado. Sua denúncia foi registrada.",
      });
    } catch (erro) {
      setErros(getFieldErrors(erro));
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "Revise os campos da denúncia." });
    } finally {
      setIsEnviando(false);
    }
  };

  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - Denúncia` : "Denúncia";

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <PageHead title={pageTitle} />
      <CabecalhoDaPagina icone={<ShieldAlert className="h-5 w-5 text-secondary" />} titulo="Denúncia" />

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <form
          className="max-w-2xl space-y-4 rounded-lg border border-subtle p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit();
          }}
        >
          <div>
            <label htmlFor="denuncia-titulo" className="mb-1 block text-13 font-medium">
              Título
            </label>
            <input
              id="denuncia-titulo"
              maxLength={200}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={campoTexto}
            />
            <ErroDoCampo mensagem={erros.title} />
          </div>
          <div>
            <label htmlFor="denuncia-descricao" className="mb-1 block text-13 font-medium">
              Descrição
            </label>
            <textarea
              id="denuncia-descricao"
              rows={6}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={campoTexto}
            />
            <ErroDoCampo mensagem={erros.description} />
          </div>
          <label className="flex items-start gap-2 text-13">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={form.is_anonymous}
              onChange={(e) => setForm({ ...form, is_anonymous: e.target.checked })}
            />
            <span>
              Prefiro ficar anônimo
              <span className="block text-12 text-secondary">
                A denúncia anônima não guarda seu nome nem o horário do envio, só o dia.
              </span>
            </span>
          </label>
          <button type="submit" className={botaoPrimario} disabled={isEnviando}>
            {isEnviando ? "Enviando..." : "Enviar denúncia"}
          </button>
        </form>

        {canReadDenuncias && (
          <section className="space-y-2">
            <h2 className="text-14 font-semibold">Denúncias recebidas ({data?.total_count ?? 0})</h2>
            {error && (
              <AvisoDaPagina>Não foi possível carregar as denúncias. Tente de novo em instantes.</AvisoDaPagina>
            )}
            {isLoading && <div className="h-32 animate-pulse rounded-lg border border-subtle bg-surface-2" />}
            {!isLoading && !error && !data?.results.length && (
              <p className="py-6 text-center text-13 text-secondary">Nenhuma denúncia recebida.</p>
            )}
            {data?.results.map((d) => (
              <article key={d.id} className="rounded-lg border border-subtle p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-13 font-semibold">{d.title}</p>
                  <p className="text-12 text-secondary">
                    {formatDia(d.reported_on)} ·{" "}
                    {d.is_anonymous ? "Anônima" : (d.author?.display_name ?? "Autor removido")}
                  </p>
                </div>
                <p className="mt-2 text-13 whitespace-pre-wrap">{d.description}</p>
              </article>
            ))}
            <Paginacao
              pagina={pagina}
              hasPrev={!!data?.prev_page_results}
              hasNext={!!data?.next_page_results}
              onChange={setPagina}
            />
          </section>
        )}
      </div>
    </div>
  );
}

export default observer(DenunciasPage);
