"use client";

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, RotateCw } from "lucide-react";
import { cn } from "@plane/utils";
import { PageHead } from "@/components/core/page-title";
import { PrintButton, PrintFooter, PrintHeader } from "@/components/print";
import { getReportMeta } from "@/components/reports/catalog";
import {
  ESTADO_INICIAL_DOS_FILTROS,
  buildPrintMeta,
  buildReportParams,
  hasFiltroAtivo,
  type TEstadoDosFiltros,
} from "@/components/reports/filtros-do-relatorio";
import { ReportFiltersBar } from "@/components/reports/report-filters";
import { ReportRenderer } from "@/components/reports/renderers";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useReport } from "@/hooks/use-report";

const readMensagemDeErro = (error: unknown) =>
  (error as { detail?: string } | undefined)?.detail ?? "Não foi possível carregar o relatório.";

function ReportDetailPage() {
  const { workspaceSlug, reportId } = useParams() as { workspaceSlug: string; reportId: string };
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const { getProjectById } = useProject();
  const { getUserDetails } = useMember();

  const meta = useMemo(() => getReportMeta(reportId), [reportId]);
  const [estado, setEstado] = useState<TEstadoDosFiltros>(ESTADO_INICIAL_DOS_FILTROS);
  const onChange = (patch: Partial<TEstadoDosFiltros>) => setEstado((atual) => ({ ...atual, ...patch }));

  const params = useMemo(() => (meta ? buildReportParams(estado, meta.filters) : {}), [estado, meta]);
  const { data, error, isLoading, isFetching, refetch } = useReport(workspaceSlug, meta?.id, params);

  const pageTitle = meta ? `${currentWorkspace?.name ?? ""} - ${meta.title}` : "Relatório";

  if (!meta) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-secondary">
        <p className="text-sm">Relatório não encontrado.</p>
        <button
          onClick={() => router.push(`/${workspaceSlug}/reports`)}
          className="text-sm text-accent-primary hover:underline"
        >
          Voltar aos relatórios
        </button>
      </div>
    );
  }

  const printMeta = buildPrintMeta(estado, {
    sistemas: estado.projectIds.map((id) => getProjectById(id)?.name ?? "").filter(Boolean),
    usuario: estado.userId ? (getUserDetails(estado.userId)?.display_name ?? null) : null,
  });

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <PageHead title={pageTitle} />

      {/* Header / ações (não imprime) */}
      <div data-print-hide className="flex items-center justify-between gap-3 border-b border-subtle px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/${workspaceSlug}/reports`)}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-surface-2"
            title="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-lg font-semibold">{meta.title}</h1>
            <p className="text-12 text-secondary">{meta.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void refetch()}
            className="inline-flex items-center gap-1.5 rounded border border-subtle px-3 py-2 text-13 text-secondary hover:text-primary"
          >
            <RotateCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            Atualizar
          </button>
          {/* LGPD: relatórios agregam dados de pessoas — a impressão vai para a trilha. */}
          <PrintButton
            mode="area"
            appearance="label"
            documentTitle={meta.title}
            auditEntity="report"
            auditEntityId={reportId}
            auditMetadata={Object.fromEntries(printMeta.map((item) => [item.label, item.value]))}
          />
        </div>
      </div>

      {/* Filtros (não imprime) */}
      {meta.filters.length > 0 && (
        <div data-print-hide className="flex flex-wrap items-end gap-4 border-b border-subtle px-6 py-3">
          <ReportFiltersBar
            filtros={meta.filters}
            estado={estado}
            onChange={onChange}
            workspaceSlug={workspaceSlug}
            opcoes={{ etapas: data?.etapas, funcoes: data?.funcoes }}
          />
          {hasFiltroAtivo(estado) && (
            <button
              onClick={() => setEstado(ESTADO_INICIAL_DOS_FILTROS)}
              className="text-12 text-accent-primary hover:underline"
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Conteúdo / área de impressão */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div data-print-area>
          {/* Cabeçalho de impressão (visível apenas no PDF/impressão) */}
          <div data-print-only>
            <PrintHeader title={meta.title} subtitle={meta.description} meta={printMeta} />
          </div>

          {isLoading && <p className="py-10 text-center text-13 text-secondary">Carregando relatório...</p>}
          {!isLoading && error && (
            <p className="py-10 text-center text-13 text-tertiary">{readMensagemDeErro(error)}</p>
          )}
          {!isLoading && !error && data && (
            <ReportRenderer reportId={reportId} data={data} contexto={{ slug: workspaceSlug, params }} />
          )}

          <div data-print-only>
            <PrintFooter />
          </div>
        </div>
      </div>
    </div>
  );
}

export default observer(ReportDetailPage);
