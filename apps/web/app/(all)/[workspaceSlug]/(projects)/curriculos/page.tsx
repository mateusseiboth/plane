/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Download, FileUser, Trash2 } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore } from "@plane/ui";
// components
import { PageHead } from "@/components/core/page-title";
import {
  AvisoDaPagina,
  CabecalhoDaPagina,
  Paginacao,
  botaoSecundario,
  campoFiltro,
} from "@/components/ouvidoria/comum";
import { InscricaoPeloSite } from "@/components/ouvidoria/inscricao-pelo-site";
import { RetencaoDeCurriculos } from "@/components/ouvidoria/retencao-de-curriculos";
import { buildPaginaCursor, formatDataHora, rotuloDaOrigem } from "@/components/ouvidoria/helpers";
// hooks
import useDebounce from "@/hooks/use-debounce";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useCurriculos, useOuvidoriaPermissoes, useVagas } from "@/hooks/use-ouvidoria";
// services
import type { TCurriculo, TCurriculoMarcacao } from "@/services/ouvidoria.service";

const POR_PAGINA = 20;

const SIM_NAO = (rotulo: string) => [
  { value: "", label: rotulo },
  { value: "true", label: "Sim" },
  { value: "false", label: "Não" },
];

type TMarcaProps = { rotulo: string; isMarcado: boolean; quem?: string | null; onToggle: () => void };

function Marca({ rotulo, isMarcado, quem, onToggle }: TMarcaProps) {
  return (
    <label className="flex items-center gap-1.5 text-12" title={isMarcado && quem ? `Marcado por ${quem}` : undefined}>
      <input type="checkbox" checked={isMarcado} onChange={onToggle} />
      {rotulo}
    </label>
  );
}

function CurriculosPage() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { currentWorkspace } = useWorkspace();
  const { canReadCurriculos, isLoading: isLoadingPermissoes } = useOuvidoriaPermissoes(slug);
  const [vaga, setVaga] = useState("");
  const vagaBuscada = useDebounce(vaga, 400);
  const [read, setRead] = useState("");
  const [interviewed, setInterviewed] = useState("");
  const [pagina, setPagina] = useState(0);
  const [excluindo, setExcluindo] = useState<TCurriculo | null>(null);
  const [isExcluindo, setIsExcluindo] = useState(false);
  const { vagas } = useVagas(slug, canReadCurriculos);
  const { data, error, isLoading, mark, remove, getDownloadUrl } = useCurriculos(
    slug,
    { position: vagaBuscada, read, interviewed, cursor: buildPaginaCursor(POR_PAGINA, pagina) },
    canReadCurriculos
  );

  const setFiltro = (aplicar: () => void) => {
    aplicar();
    setPagina(0);
  };

  const onMark = async (id: string, marcacao: TCurriculoMarcacao) => {
    try {
      await mark(id, marcacao);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "Não foi possível salvar. Tente de novo." });
    }
  };

  const onExcluir = async () => {
    if (!excluindo) return;
    setIsExcluindo(true);
    try {
      await remove(excluindo.id);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Excluído",
        message: `O currículo de ${excluindo.name} foi excluído.`,
      });
      setExcluindo(null);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "Não foi possível excluir. Tente de novo." });
    } finally {
      setIsExcluindo(false);
    }
  };

  const total = data?.total_count ?? 0;
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - Currículos` : "Currículos";

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <PageHead title={pageTitle} />
      <CabecalhoDaPagina
        icone={<FileUser className="h-5 w-5 text-secondary" />}
        titulo="Currículos"
        subtitulo={canReadCurriculos ? `${total} ${total === 1 ? "currículo" : "currículos"}` : undefined}
      >
        {canReadCurriculos && <RetencaoDeCurriculos slug={slug} />}
      </CabecalhoDaPagina>

      {!isLoadingPermissoes && !canReadCurriculos && (
        <div className="p-6">
          <AvisoDaPagina>Você não tem permissão para ver os currículos.</AvisoDaPagina>
        </div>
      )}

      {canReadCurriculos && (
        <>
          <InscricaoPeloSite slug={slug} />

          <div className="flex flex-wrap items-center gap-3 border-b border-subtle px-6 py-3 text-12">
            <input
              aria-label="Vaga"
              list="vagas-dos-curriculos"
              placeholder="Vaga"
              value={vaga}
              onChange={(e) => setFiltro(() => setVaga(e.target.value))}
              className={campoFiltro}
            />
            <datalist id="vagas-dos-curriculos">
              {vagas.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
            <select
              aria-label="Lido"
              value={read}
              onChange={(e) => setFiltro(() => setRead(e.target.value))}
              className={campoFiltro}
            >
              {SIM_NAO("Lido").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.value ? `Lido: ${o.label}` : o.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Entrevistado"
              value={interviewed}
              onChange={(e) => setFiltro(() => setInterviewed(e.target.value))}
              className={campoFiltro}
            >
              {SIM_NAO("Entrevistado").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.value ? `Entrevistado: ${o.label}` : o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-6">
            {error && (
              <AvisoDaPagina>Não foi possível carregar os currículos. Tente de novo em instantes.</AvisoDaPagina>
            )}
            {isLoading && <div className="h-32 animate-pulse rounded-lg border border-subtle bg-surface-2" />}
            {!isLoading && !error && !data?.results.length && (
              <p className="py-10 text-center text-13 text-secondary">Nenhum currículo encontrado.</p>
            )}
            {data?.results.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-subtle p-4"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="flex flex-wrap items-center gap-2 text-13 font-semibold">
                    <span>
                      {c.name} · {c.position}
                    </span>
                    <span className="rounded-full border border-subtle px-2 py-0.5 text-11 font-medium text-secondary">
                      {rotuloDaOrigem(c.source)}
                    </span>
                  </p>
                  <p className="text-12 text-secondary">
                    Recebido em {formatDataHora(c.received_at)}
                    {c.phone ? ` · ${c.phone}` : ""}
                    {c.email ? ` · ${c.email}` : ""}
                    {c.city ? ` · ${c.city}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Marca
                    rotulo="Lido"
                    isMarcado={c.is_read}
                    quem={c.read_by?.display_name}
                    onToggle={() => void onMark(c.id, { is_read: !c.is_read })}
                  />
                  <Marca
                    rotulo="Entrevistado"
                    isMarcado={c.is_interviewed}
                    quem={c.interviewed_by?.display_name}
                    onToggle={() => void onMark(c.id, { is_interviewed: !c.is_interviewed })}
                  />
                  <a href={getDownloadUrl(c.id)} className={botaoSecundario}>
                    <Download className="h-3.5 w-3.5" />
                    Baixar
                  </a>
                  <button type="button" className={botaoSecundario} onClick={() => setExcluindo(c)}>
                    <Trash2 className="h-3.5 w-3.5" />
                    Excluir
                  </button>
                </div>
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

      <AlertModalCore
        isOpen={!!excluindo}
        handleClose={() => setExcluindo(null)}
        handleSubmit={() => void onExcluir()}
        isSubmitting={isExcluindo}
        title="Excluir currículo"
        content={<>O currículo de {excluindo?.name} e o arquivo serão apagados de vez. Não é possível desfazer.</>}
      />
    </div>
  );
}

export default observer(CurriculosPage);
