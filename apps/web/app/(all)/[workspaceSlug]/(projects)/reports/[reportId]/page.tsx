"use client";

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Printer, RotateCw } from "lucide-react";
import { cn } from "@plane/utils";
import { PageHead } from "@/components/core/page-title";
import { EntityDropdown } from "@/components/dropdowns/entity";
import { getReportMeta } from "@/components/reports/catalog";
import { ReportRenderer } from "@/components/reports/renderers";
import { useProject } from "@/hooks/store/use-project";
import { useWorkspace } from "@/hooks/store/use-workspace";
import reportsService, { type ReportFilters } from "@/services/reports.service";

// CSS de impressão: oculta o restante da página e imprime apenas a área do relatório.
const PRINT_STYLES = `
@media print {
  body * { visibility: hidden !important; }
  #report-print-area, #report-print-area * { visibility: visible !important; }
  #report-print-area {
    position: absolute !important; left: 0; top: 0; width: 100%;
    padding: 0 !important; margin: 0 !important;
  }
  .report-no-print { display: none !important; }
  .report-print-header { display: block !important; }
  @page { size: A4; margin: 14mm; }
}
`;

function ReportDetailPage() {
  const { workspaceSlug, reportId } = useParams() as { workspaceSlug: string; reportId: string };
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const { workspaceProjectIds, getProjectById } = useProject();

  const meta = useMemo(() => getReportMeta(reportId), [reportId]);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [entityId, setEntityId] = useState<string | null>(null);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

  const pageTitle = meta ? `${currentWorkspace?.name ?? ""} - ${meta.title}` : "Relatório";

  const load = async () => {
    if (!meta) return;
    setLoading(true);
    const params: ReportFilters = {};
    if (dateFrom) params.date_from = new Date(dateFrom).toISOString();
    if (dateTo) params.date_to = new Date(dateTo + "T23:59:59").toISOString();
    if (projectId) params.project_ids = projectId;
    if (entityId) params.entity_id = entityId;
    const result = await reportsService.byReportId(workspaceSlug, reportId, params);
    setData(result);
    setGeneratedAt(new Date());
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, reportId, dateFrom, dateTo, projectId, entityId]);

  if (!meta) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-secondary">
        <p className="text-sm">Relatório não encontrado.</p>
        <button onClick={() => router.push(`/${workspaceSlug}/reports`)} className="text-sm text-accent-primary hover:underline">
          Voltar aos relatórios
        </button>
      </div>
    );
  }

  const showPeriod = meta.filters.includes("period");
  const showProject = meta.filters.includes("project");
  const showEntity = meta.filters.includes("entity");

  const periodLabel = dateFrom || dateTo ? `${dateFrom || "início"} → ${dateTo || "hoje"}` : "Todo o período";
  const projectName = projectId ? getProjectById(projectId)?.name : null;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <PageHead title={pageTitle} />
      <style>{PRINT_STYLES}</style>

      {/* Header / ações (não imprime) */}
      <div className="report-no-print flex items-center justify-between gap-3 border-b border-subtle px-6 py-4">
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
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded border border-subtle px-3 py-2 text-13 text-secondary hover:text-primary"
          >
            <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Atualizar
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded bg-accent-primary px-3 py-2 text-13 font-medium text-white hover:bg-accent-primary/90"
          >
            <Printer className="h-4 w-4" />
            Gerar PDF / Imprimir
          </button>
        </div>
      </div>

      {/* Filtros (não imprime) */}
      {(showPeriod || showProject || showEntity) && (
        <div className="report-no-print flex flex-wrap items-end gap-4 border-b border-subtle px-6 py-3">
          {showPeriod && (
            <>
              <div>
                <label className="mb-1 block text-11 text-secondary">De</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="rounded border border-subtle bg-surface-2 px-2 py-1.5 text-12 outline-none focus:border-accent-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-11 text-secondary">Até</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="rounded border border-subtle bg-surface-2 px-2 py-1.5 text-12 outline-none focus:border-accent-primary"
                />
              </div>
            </>
          )}
          {showProject && (
            <div>
              <label className="mb-1 block text-11 text-secondary">Sistema</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="min-w-[180px] rounded border border-subtle bg-surface-2 px-2 py-1.5 text-12 outline-none focus:border-accent-primary"
              >
                <option value="">Todos os sistemas</option>
                {(workspaceProjectIds ?? []).map((id) => (
                  <option key={id} value={id}>
                    {getProjectById(id)?.name ?? id}
                  </option>
                ))}
              </select>
            </div>
          )}
          {showEntity && (
            <div>
              <label className="mb-1 block text-11 text-secondary">Entidade</label>
              <EntityDropdown
                workspaceSlug={workspaceSlug}
                value={entityId}
                onChange={(id) => setEntityId(id)}
                placeholder="Todas as entidades"
                className="min-w-[180px]"
              />
            </div>
          )}
          {(dateFrom || dateTo || projectId || entityId) && (
            <button
              onClick={() => { setDateFrom(""); setDateTo(""); setProjectId(""); setEntityId(null); }}
              className="text-12 text-accent-primary hover:underline"
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Conteúdo / área de impressão */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div id="report-print-area">
          {/* Cabeçalho de impressão (visível apenas no PDF/impressão) */}
          <div className="report-print-header mb-6 hidden border-b border-subtle pb-4">
            <h1 className="text-xl font-bold">{meta.title}</h1>
            <p className="text-13 text-secondary">{currentWorkspace?.name}</p>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-11 text-secondary">
              <span>Período: {periodLabel}</span>
              {projectName && <span>Sistema: {projectName}</span>}
              {generatedAt && <span>Gerado em: {generatedAt.toLocaleString("pt-BR")}</span>}
            </div>
          </div>

          {loading && <p className="py-10 text-center text-13 text-secondary">Carregando relatório...</p>}
          {!loading && !data && <p className="py-10 text-center text-13 text-tertiary">Não foi possível carregar o relatório.</p>}
          {!loading && data && <ReportRenderer reportId={reportId} data={data} />}
        </div>
      </div>
    </div>
  );
}

export default observer(ReportDetailPage);
