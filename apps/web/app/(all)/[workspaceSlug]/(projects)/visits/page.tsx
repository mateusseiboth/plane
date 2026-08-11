"use client";

import {PageHead} from "@/components/core/page-title";
import {EntityDropdown} from "@/components/dropdowns/entity";
import {SeletorDeContatos} from "@/components/entity-contacts";
import {PrintButton, TechnicalVisitsPrintDocument} from "@/components/print";
import {useWorkspace} from "@/hooks/store/use-workspace";
import {APIService} from "@/services/api.service";
import {API_BASE_URL} from "@plane/constants";
import {cn} from "@plane/utils";
import {Building2, Calendar, ChevronRight, Plus} from "lucide-react";
import {observer} from "mobx-react";
import {useParams, useRouter} from "next/navigation";
import {useEffect, useState} from "react";

// ── Service ─────────────────────────────────────────────────────────────────

class TechnicalVisitService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }
  list(slug: string, params?: Record<string, any>) {
    return this.get(`/api/workspaces/${slug}/technical-visits/`, {params})
      .then((r) => r?.data?.results ?? [])
      .catch(() => []);
  }
  create(slug: string, data: any) {
    return this.post(`/api/workspaces/${slug}/technical-visits/`, data)
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }
  update(slug: string, id: string, data: any) {
    return this.patch(`/api/workspaces/${slug}/technical-visits/${id}/`, data)
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }
}

const visitService = new TechnicalVisitService();

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<number, string> = {
  0: "bg-blue-100 text-blue-800",
  1: "bg-yellow-100 text-yellow-800",
  2: "bg-purple-100 text-purple-800",
  3: "bg-orange-100 text-orange-800",
  4: "bg-green-100 text-green-800",
  5: "bg-red-100 text-red-800",
};

const VISIT_STATUS_LABELS = ["Agendada", "Em Andamento", "Relatório", "Aguard. Assinatura", "Concluída", "Cancelada"];

function toDateTimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromDateTimeLocal(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function StatusBadge({status, label}: {status: number; label: string}) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-11 font-medium", STATUS_COLORS[status] ?? "bg-surface-2 text-secondary")}>
      {label}
    </span>
  );
}

// ── Create modal ──────────────────────────────────────────────────────────────

function CreateVisitModal({onClose, onCreate}: {onClose: () => void; onCreate: (v: any) => void}) {
  const {workspaceSlug} = useParams();
  const [form, setForm] = useState<{
    entity_id: string | null;
    city: string;
    scheduled_date: string;
    contact_ids: string[];
  }>({
    entity_id: null,
    city: "",
    scheduled_date: "",
    contact_ids: [],
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const visit = await visitService.create(workspaceSlug.toString(), form);
      onCreate(visit);
      onClose();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-surface-1 p-6 shadow-xl">
        <h2 className="mb-4 text-base font-semibold">Nova Visita Técnica</h2>
        <form
          onSubmit={handleSubmit}
          className="space-y-3"
        >
          <div>
            <label className="mb-1 block text-12 text-secondary">Entidade</label>
            <EntityDropdown
              workspaceSlug={workspaceSlug.toString()}
              value={form.entity_id}
              onChange={(entityId) => setForm((f) => ({...f, entity_id: entityId, contact_ids: []}))}
              placeholder="Selecionar entidade"
              className="w-full"
            />
          </div>
          <div>
            <label className="mb-1 block text-12 text-secondary">Cidade</label>
            <input
              className="w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-13 outline-none focus:border-accent-primary"
              value={form.city}
              onChange={(e) => setForm((f) => ({...f, city: e.target.value}))}
              placeholder="Campo Grande, MS"
            />
          </div>
          <div>
            <label className="mb-1 block text-12 text-secondary">Data agendada</label>
            <input
              type="datetime-local"
              className="w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-13 outline-none focus:border-accent-primary"
              value={form.scheduled_date}
              onChange={(e) => setForm((f) => ({...f, scheduled_date: e.target.value}))}
            />
          </div>
          <div>
            <label className="mb-1 block text-12 text-secondary">Responsáveis</label>
            <SeletorDeContatos
              workspaceSlug={workspaceSlug.toString()}
              entityId={form.entity_id}
              value={form.contact_ids}
              onChange={(contactIds) => setForm((f) => ({...f, contact_ids: contactIds}))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-3 py-1.5 text-13 text-secondary hover:text-primary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-accent-primary px-4 py-1.5 text-13 font-medium text-white hover:bg-accent-primary/90 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Criar Visita"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function TechnicalVisitsPage() {
  const {workspaceSlug} = useParams();
  const router = useRouter();
  const {currentWorkspace} = useWorkspace();
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<number | null>(null);

  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - Visitas Técnicas` : "Visitas Técnicas";

  const load = async () => {
    setLoading(true);
    const params = statusFilter !== null ? {status: statusFilter} : {};
    const data = await visitService.list(workspaceSlug.toString(), params);
    setVisits(data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [workspaceSlug, statusFilter]);

  const handleStatusChange = async (visitId: string, newStatus: number) => {
    const updated = await visitService.update(workspaceSlug.toString(), visitId, {status: newStatus});
    setVisits((vs) => vs.map((v) => (v.id === visitId ? {...v, ...updated} : v)));
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <PageHead title={pageTitle} />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-subtle px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">Visitas Técnicas</h1>
          <p className="text-13 text-secondary">
            {visits.length} visita{visits.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PrintButton documentTitle="Visitas técnicas" auditEntity="technical_visit" auditEntityId={currentWorkspace?.id ?? ""}
            auditMetadata={{escopo: "listagem"}} />
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded bg-accent-primary px-3 py-2 text-13 font-medium text-white hover:bg-accent-primary/90"
          >
            <Plus className="h-4 w-4" />
            Nova Visita
          </button>
        </div>
      </div>

      <TechnicalVisitsPrintDocument
        visits={visits}
        subtitle={currentWorkspace?.name}
        statusLabel={statusFilter === null ? "Todas" : VISIT_STATUS_LABELS[statusFilter]}
      />

      {/* Status filters */}
      <div className="flex gap-2 overflow-x-auto border-b border-subtle px-6 py-3">
        {[null, 0, 1, 2, 3, 4, 5].map((s) => {
          const label = s === null ? "Todas" : VISIT_STATUS_LABELS[s];
          return (
            <button
              key={s ?? "all"}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-12 font-medium transition-colors",
                statusFilter === s ? "bg-accent-primary text-white" : "bg-surface-2 text-secondary hover:text-primary",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Visit list */}
      <div className="flex-1 overflow-y-auto">
        {loading && <div className="p-6 text-sm text-secondary">Carregando...</div>}
        {!loading && visits.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-secondary">
            <Calendar className="h-12 w-12 opacity-50" />
            <p className="text-sm">Nenhuma visita técnica encontrada.</p>
            <button
              onClick={() => setShowCreate(true)}
              className="text-sm text-accent-primary hover:underline"
            >
              Agendar primeira visita
            </button>
          </div>
        )}
        {!loading &&
          visits.map((visit) => (
            <div
              key={visit.id}
              onClick={() => router.push(`/${workspaceSlug}/visits/${visit.id}`)}
              className="flex cursor-pointer items-center justify-between border-b border-subtle px-6 py-4 hover:bg-surface-2"
            >
              <div className="flex items-start gap-4">
                <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-surface-2">
                  <Calendar className="h-4 w-4 text-secondary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={visit.status} label={visit.status_label} />
                    {visit.visit_number && <span className="text-11 text-tertiary">#{visit.visit_number}</span>}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-13">
                    {visit.entity && (
                      <span className="flex items-center gap-1 text-secondary">
                        <Building2 className="h-3.5 w-3.5" />
                        {visit.entity.name}
                      </span>
                    )}
                    {visit.city && <span className="text-secondary">{visit.city}</span>}
                    {visit.scheduled_date && (
                      <span className="text-secondary">
                        {new Date(visit.scheduled_date).toLocaleString("pt-BR", {dateStyle: "short", timeStyle: "short"})}
                      </span>
                    )}
                  </div>
                  {/* Os dois convivem: as pessoas cadastradas e o texto solto que veio do SAC. */}
                  {visit.contact_records?.length > 0 && (
                    <p className="mt-0.5 text-12 text-tertiary">
                      {visit.contact_records.map((c: {name: string}) => c.name).join(", ")}
                    </p>
                  )}
                  {visit.contacts && <p className="mt-0.5 text-12 text-tertiary">{visit.contacts}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {visit.status === 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleStatusChange(visit.id, 1); }}
                    className="rounded border border-subtle px-2 py-1 text-12 text-secondary hover:border-accent-primary hover:text-accent-primary"
                  >
                    Iniciar
                  </button>
                )}
                {(visit.status === 1 || visit.status === 2 || visit.status === 3) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); router.push(`/${workspaceSlug}/visits/${visit.id}`); }}
                    className="rounded border border-subtle px-2 py-1 text-12 text-secondary hover:border-accent-primary hover:text-accent-primary"
                  >
                    {visit.status === 1 ? "Abrir relatório" : "Editar relatório"}
                  </button>
                )}
                <ChevronRight className="h-4 w-4 text-tertiary" />
              </div>
            </div>
          ))}
      </div>

      {showCreate && (
        <CreateVisitModal
          onClose={() => setShowCreate(false)}
          onCreate={(v) => setVisits((vs) => [v, ...vs])}
        />
      )}

    </div>
  );
}

export default observer(TechnicalVisitsPage);
