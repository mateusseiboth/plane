"use client";

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams, useRouter } from "next/navigation";
import { Building2, Calendar, ChevronLeft, ChevronRight, Plus, User } from "lucide-react";
import { cn } from "@plane/utils";
import { PageHead } from "@/components/core/page-title";
import { EntityDropdown } from "@/components/dropdowns/entity";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { PrintButton, TechnicalVisitsPrintDocument } from "@/components/print";
import { CreateVisitModal } from "@/components/technical-visits/create-visit-modal";
import type { TVisitListFilters } from "@/components/technical-visits/types";
import {
  INPUT_CLASS,
  VISIT_STATUS_OPTIONS,
  VisitOverdueBadge,
  VisitStatusBadge,
  formatDateTime,
} from "@/components/technical-visits/visit-display";
import { buildTechnicianNames } from "@/components/technical-visits/visit-rules";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { VISITAS_POR_PAGINA, useTechnicalVisits, useVisitPermissions } from "@/hooks/use-technical-visits";

const FILTROS_VAZIOS: TVisitListFilters = {
  status: null,
  technicianId: null,
  entityId: null,
  dateFrom: "",
  dateTo: "",
  overdue: false,
};

const CHIP = "shrink-0 rounded-full px-3 py-1 text-12 font-medium transition-colors";
const chipClass = (ativo: boolean) =>
  cn(CHIP, ativo ? "bg-accent-primary text-white" : "bg-surface-2 text-secondary hover:text-primary");

function TechnicalVisitsPage() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const { canRegister } = useVisitPermissions(slug);
  const [filtros, setFiltros] = useState<TVisitListFilters>(FILTROS_VAZIOS);
  const [pagina, setPagina] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const { data, isLoading, refetch } = useTechnicalVisits(slug, filtros, pagina);

  const visits = data?.results ?? [];
  const total = data?.total_count ?? 0;
  const totalDePaginas = Math.max(1, Math.ceil(total / VISITAS_POR_PAGINA));
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - Visitas Técnicas` : "Visitas Técnicas";
  const statusLabel = VISIT_STATUS_OPTIONS.find((o) => o.value === filtros.status)?.label ?? "Todas";

  const applyFiltro = (parcial: Partial<TVisitListFilters>) => {
    setFiltros((atual) => ({ ...atual, ...parcial }));
    setPagina(0);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <PageHead title={pageTitle} />

      <div className="flex items-center justify-between border-b border-subtle px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">Visitas Técnicas</h1>
          <p className="text-13 text-secondary">
            {total} visita{total !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PrintButton
            documentTitle="Visitas técnicas"
            auditEntity="technical_visit"
            auditEntityId={currentWorkspace?.id ?? ""}
            auditMetadata={{ escopo: "listagem" }}
          />
          {canRegister && (
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 rounded bg-accent-primary px-3 py-2 text-13 font-medium text-white hover:bg-accent-primary/90"
            >
              <Plus className="h-4 w-4" />
              Nova visita
            </button>
          )}
        </div>
      </div>

      <TechnicalVisitsPrintDocument visits={visits} subtitle={currentWorkspace?.name} statusLabel={statusLabel} />

      <div className="flex gap-2 overflow-x-auto border-b border-subtle px-6 py-3">
        <button
          onClick={() => applyFiltro({ status: null, overdue: false })}
          className={chipClass(filtros.status === null && !filtros.overdue)}
        >
          Todas
        </button>
        <button
          onClick={() => applyFiltro({ status: null, overdue: !filtros.overdue })}
          className={chipClass(!!filtros.overdue)}
        >
          Vencidas
        </button>
        {VISIT_STATUS_OPTIONS.map((opcao) => (
          <button
            key={opcao.value}
            onClick={() => applyFiltro({ status: opcao.value })}
            className={chipClass(filtros.status === opcao.value)}
          >
            {opcao.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 border-b border-subtle px-6 py-3">
        <div className="w-48">
          <label className="mb-1 block text-11 text-secondary">Técnico</label>
          <MemberDropdown
            value={filtros.technicianId ?? null}
            onChange={(id) => applyFiltro({ technicianId: id })}
            multiple={false}
            buttonVariant="border-with-text"
            placeholder="Todos"
            className="w-full"
            buttonClassName="w-full"
          />
        </div>
        <div className="w-56">
          <label className="mb-1 block text-11 text-secondary">Entidade</label>
          <EntityDropdown
            workspaceSlug={slug}
            value={filtros.entityId}
            onChange={(id) => applyFiltro({ entityId: id })}
            placeholder="Todas"
            className="w-full"
          />
        </div>
        <div>
          <label className="mb-1 block text-11 text-secondary">De</label>
          <input
            type="date"
            className={cn(INPUT_CLASS, "py-1.5")}
            value={filtros.dateFrom ?? ""}
            onChange={(e) => applyFiltro({ dateFrom: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1 block text-11 text-secondary">Até</label>
          <input
            type="date"
            className={cn(INPUT_CLASS, "py-1.5")}
            value={filtros.dateTo ?? ""}
            onChange={(e) => applyFiltro({ dateTo: e.target.value })}
          />
        </div>
        <button
          type="button"
          onClick={() => applyFiltro(FILTROS_VAZIOS)}
          className="rounded px-3 py-1.5 text-12 text-secondary hover:text-primary"
        >
          Limpar filtros
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && <div className="text-sm p-6 text-secondary">Carregando...</div>}
        {!isLoading && visits.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-secondary">
            <Calendar className="h-12 w-12 opacity-50" />
            <p className="text-sm">Nenhuma visita técnica encontrada.</p>
          </div>
        )}
        {!isLoading &&
          visits.map((visit) => (
            <div
              key={visit.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/${slug}/visits/${visit.id}`)}
              onKeyDown={(e) => e.key === "Enter" && router.push(`/${slug}/visits/${visit.id}`)}
              className="flex cursor-pointer items-center justify-between border-b border-subtle px-6 py-4 hover:bg-surface-2"
            >
              <div className="flex items-start gap-4">
                <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-surface-2">
                  <Calendar className="h-4 w-4 text-secondary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    {visit.visit_number && <span className="text-13 font-medium">Nº {visit.visit_number}</span>}
                    <VisitStatusBadge status={visit.status} label={visit.status_label} />
                    {visit.is_overdue && <VisitOverdueBadge />}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-13 text-secondary">
                    {visit.entity && (
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5" />
                        {visit.entity.name}
                      </span>
                    )}
                    {visit.city && <span>{visit.city}</span>}
                    {visit.scheduled_date && <span>{formatDateTime(visit.scheduled_date)}</span>}
                    {buildTechnicianNames(visit) && (
                      <span className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        {buildTechnicianNames(visit)}
                      </span>
                    )}
                  </div>
                  {visit.issues.length > 0 && (
                    <p className="mt-0.5 text-12 text-tertiary">{visit.issues.map((i) => i.code).join(", ")}</p>
                  )}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-tertiary" />
            </div>
          ))}
      </div>

      <div className="flex items-center justify-between border-t border-subtle px-6 py-2 text-12 text-secondary">
        <span>
          Página {pagina + 1} de {totalDePaginas}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={!data?.prev_page_results}
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
            className="rounded border border-subtle p-1.5 disabled:opacity-40"
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={!data?.next_page_results}
            onClick={() => setPagina((p) => p + 1)}
            className="rounded border border-subtle p-1.5 disabled:opacity-40"
            aria-label="Próxima página"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {showCreate && (
        <CreateVisitModal
          workspaceSlug={slug}
          onClose={() => setShowCreate(false)}
          onCreated={(visit) => {
            void refetch();
            router.push(`/${slug}/visits/${visit.id}`);
          }}
        />
      )}
    </div>
  );
}

export default observer(TechnicalVisitsPage);
