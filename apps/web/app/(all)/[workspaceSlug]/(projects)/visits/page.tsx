"use client";

import {PageHead} from "@/components/core/page-title";
import {EntityDropdown} from "@/components/dropdowns/entity";
import {useProject} from "@/hooks/store/use-project";
import {useWorkspace} from "@/hooks/store/use-workspace";
import {APIService} from "@/services/api.service";
import {API_BASE_URL} from "@plane/constants";
import {cn} from "@plane/utils";
import {Building2, Calendar, Check, ChevronRight, Layers, Plus} from "lucide-react";
import {observer} from "mobx-react";
import {useParams} from "next/navigation";
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
  const [form, setForm] = useState<{entity_id: string | null; city: string; scheduled_date: string; contacts: string}>({
    entity_id: null,
    city: "",
    scheduled_date: "",
    contacts: "",
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
              onChange={(entityId) => setForm((f) => ({...f, entity_id: entityId}))}
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
            <label className="mb-1 block text-12 text-secondary">Contatos</label>
            <input
              className="w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-13 outline-none focus:border-accent-primary"
              value={form.contacts}
              onChange={(e) => setForm((f) => ({...f, contacts: e.target.value}))}
              placeholder="Nome e telefone do contato"
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

function VisitEditorModal({
  visit,
  onClose,
  onSave,
}: {
  visit: any;
  onClose: () => void;
  onSave: (visitId: string, data: any) => Promise<void>;
}) {
  const {workspaceSlug} = useParams();
  const {joinedProjectIds, getProjectById} = useProject();
  const [saving, setSaving] = useState(false);
  const [projectIds, setProjectIds] = useState<string[]>(Array.isArray(visit?.project_ids) ? visit.project_ids : []);
  const [form, setForm] = useState({
    entity_id: visit?.entity_id ?? visit?.entity?.id ?? null,
    city: visit?.city ?? "",
    scheduled_date: toDateTimeLocal(visit?.scheduled_date),
    contacts: visit?.contacts ?? "",
    status: visit?.status ?? 0,
    started_at: toDateTimeLocal(visit?.started_at),
    finished_at: toDateTimeLocal(visit?.finished_at),
    period: visit?.period ?? "",
    summary: visit?.summary ?? "",
    conclusion: visit?.conclusion ?? "",
    mot_update: !!visit?.mot_update,
    mot_bug_fix: !!visit?.mot_bug_fix,
    mot_training: !!visit?.mot_training,
    mot_improvement: !!visit?.mot_improvement,
    mot_commercial: !!visit?.mot_commercial,
    mot_other: !!visit?.mot_other,
    mot_other_description: visit?.mot_other_description ?? "",
  });

  useEffect(() => {
    setForm({
      entity_id: visit?.entity_id ?? visit?.entity?.id ?? null,
      city: visit?.city ?? "",
      scheduled_date: toDateTimeLocal(visit?.scheduled_date),
      contacts: visit?.contacts ?? "",
      status: visit?.status ?? 0,
      started_at: toDateTimeLocal(visit?.started_at),
      finished_at: toDateTimeLocal(visit?.finished_at),
      period: visit?.period ?? "",
      summary: visit?.summary ?? "",
      conclusion: visit?.conclusion ?? "",
      mot_update: !!visit?.mot_update,
      mot_bug_fix: !!visit?.mot_bug_fix,
      mot_training: !!visit?.mot_training,
      mot_improvement: !!visit?.mot_improvement,
      mot_commercial: !!visit?.mot_commercial,
      mot_other: !!visit?.mot_other,
      mot_other_description: visit?.mot_other_description ?? "",
    });
  }, [visit]);

  const isFinalized = form.status === 4 || form.status === 5;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!visit?.id) return;
    setSaving(true);
    try {
      await onSave(visit.id, {
        entity_id: form.entity_id,
        city: form.city,
        scheduled_date: form.scheduled_date ? fromDateTimeLocal(form.scheduled_date) : null,
        contacts: form.contacts,
        status: form.status,
        started_at: form.started_at ? fromDateTimeLocal(form.started_at) : null,
        finished_at: form.finished_at ? fromDateTimeLocal(form.finished_at) : null,
        period: form.period || null,
        summary: form.summary || null,
        conclusion: form.conclusion || null,
        mot_update: form.mot_update,
        mot_bug_fix: form.mot_bug_fix,
        mot_training: form.mot_training,
        mot_improvement: form.mot_improvement,
        mot_commercial: form.mot_commercial,
        mot_other: form.mot_other,
        mot_other_description: form.mot_other_description || null,
        project_ids: projectIds,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-lg bg-surface-1 shadow-xl">
        <div className="flex items-center justify-between border-b border-subtle px-6 py-4">
          <div>
            <h2 className="text-base font-semibold">Editar Visita Técnica</h2>
            <p className="text-12 text-secondary">
              {visit?.entity?.name ?? "Sem entidade"}
              {visit?.visit_number ? ` · #${visit.visit_number}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-13 text-secondary hover:text-primary"
          >
            Fechar
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="max-h-[80vh] overflow-y-auto px-6 py-5"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-12 text-secondary">Entidade</label>
                <EntityDropdown
                  workspaceSlug={workspaceSlug.toString()}
                  value={form.entity_id}
                  onChange={(entityId) => setForm((f) => ({...f, entity_id: entityId}))}
                  placeholder="Selecionar entidade"
                  className="w-full"
                  disabled={isFinalized}
                />
              </div>
              <div>
                <label className="mb-1 block text-12 text-secondary">Sistemas atendidos</label>
                <div className="max-h-36 overflow-y-auto rounded border border-subtle bg-surface-2 p-1">
                  {(joinedProjectIds ?? []).length === 0 && (
                    <p className="px-2 py-1 text-12 text-tertiary">Nenhum projeto disponível</p>
                  )}
                  {(joinedProjectIds ?? []).map((pid) => {
                    const proj = getProjectById(pid);
                    if (!proj) return null;
                    const selected = projectIds.includes(pid);
                    return (
                      <button
                        key={pid}
                        type="button"
                        onClick={() => setProjectIds((ids) => selected ? ids.filter((id) => id !== pid) : [...ids, pid])}
                        className={cn("flex w-full items-center gap-2 rounded px-2 py-1.5 text-13 hover:bg-surface-1", selected && "bg-accent-primary/10 text-accent-primary")}
                      >
                        <Layers className="h-3.5 w-3.5 shrink-0" />
                        <span className="flex-1 truncate text-left">{proj.name}</span>
                        {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-12 text-secondary">Cidade</label>
                <input
                  className="w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-13 outline-none focus:border-accent-primary disabled:opacity-60"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({...f, city: e.target.value}))}
                  disabled={isFinalized}
                />
              </div>
              <div>
                <label className="mb-1 block text-12 text-secondary">Data agendada</label>
                <input
                  type="datetime-local"
                  className="w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-13 outline-none focus:border-accent-primary disabled:opacity-60"
                  value={form.scheduled_date}
                  onChange={(e) => setForm((f) => ({...f, scheduled_date: e.target.value}))}
                  disabled={isFinalized}
                />
              </div>
              <div>
                <label className="mb-1 block text-12 text-secondary">Contatos</label>
                <input
                  className="w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-13 outline-none focus:border-accent-primary disabled:opacity-60"
                  value={form.contacts}
                  onChange={(e) => setForm((f) => ({...f, contacts: e.target.value}))}
                  disabled={isFinalized}
                />
              </div>
              <div>
                <label className="mb-1 block text-12 text-secondary">Período</label>
                <input
                  className="w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-13 outline-none focus:border-accent-primary disabled:opacity-60"
                  value={form.period}
                  onChange={(e) => setForm((f) => ({...f, period: e.target.value}))}
                  placeholder="Ex.: Manhã"
                  disabled={isFinalized}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-12 text-secondary">Status</label>
                <select
                  className="w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-13 outline-none focus:border-accent-primary disabled:opacity-60"
                  value={form.status}
                  onChange={(e) => setForm((f) => ({...f, status: Number(e.target.value)}))}
                  disabled={isFinalized}
                >
                  {VISIT_STATUS_LABELS.map((label, index) => (
                    <option
                      key={label}
                      value={index}
                    >
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-12 text-secondary">Início</label>
                  <input
                    type="datetime-local"
                    className="w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-13 outline-none focus:border-accent-primary disabled:opacity-60"
                    value={form.started_at}
                    onChange={(e) => setForm((f) => ({...f, started_at: e.target.value}))}
                    disabled={isFinalized}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-12 text-secondary">Fim</label>
                  <input
                    type="datetime-local"
                    className="w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-13 outline-none focus:border-accent-primary disabled:opacity-60"
                    value={form.finished_at}
                    onChange={(e) => setForm((f) => ({...f, finished_at: e.target.value}))}
                    disabled={isFinalized}
                  />
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ["mot_update", "Atualização"],
                  ["mot_bug_fix", "Correção"],
                  ["mot_training", "Treinamento"],
                  ["mot_improvement", "Melhoria"],
                  ["mot_commercial", "Comercial"],
                  ["mot_other", "Outro"],
                ].map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 rounded border border-subtle px-3 py-2 text-13"
                  >
                    <input
                      type="checkbox"
                      checked={(form as any)[key]}
                      onChange={(e) => setForm((f) => ({...f, [key]: e.target.checked}) as any)}
                      disabled={isFinalized}
                    />
                    {label}
                  </label>
                ))}
              </div>

              <div>
                <label className="mb-1 block text-12 text-secondary">Descrição do outro motivo</label>
                <input
                  className="w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-13 outline-none focus:border-accent-primary disabled:opacity-60"
                  value={form.mot_other_description}
                  onChange={(e) => setForm((f) => ({...f, mot_other_description: e.target.value}))}
                  disabled={isFinalized}
                />
              </div>

              <div>
                <label className="mb-1 block text-12 text-secondary">Resumo</label>
                <textarea
                  rows={5}
                  className="w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-13 outline-none focus:border-accent-primary disabled:opacity-60"
                  value={form.summary}
                  onChange={(e) => setForm((f) => ({...f, summary: e.target.value}))}
                  placeholder="Resumo do que foi realizado"
                  disabled={isFinalized}
                />
              </div>

              <div>
                <label className="mb-1 block text-12 text-secondary">Conclusão</label>
                <textarea
                  rows={5}
                  className="w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-13 outline-none focus:border-accent-primary disabled:opacity-60"
                  value={form.conclusion}
                  onChange={(e) => setForm((f) => ({...f, conclusion: e.target.value}))}
                  placeholder="Conclusão da visita"
                  disabled={isFinalized}
                />
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-subtle pt-4">
            {!isFinalized && (
              <>
                {form.status === 0 && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({...f, status: 1}))}
                    className="rounded border border-subtle px-3 py-1.5 text-13 text-secondary hover:border-accent-primary hover:text-accent-primary"
                  >
                    Iniciar visita
                  </button>
                )}
                {form.status === 1 && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({...f, status: 2}))}
                    className="rounded border border-subtle px-3 py-1.5 text-13 text-secondary hover:border-accent-primary hover:text-accent-primary"
                  >
                    Iniciar relatório
                  </button>
                )}
                {form.status === 2 && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({...f, status: 3}))}
                    className="rounded border border-subtle px-3 py-1.5 text-13 text-secondary hover:border-accent-primary hover:text-accent-primary"
                  >
                    Solicitar assinatura
                  </button>
                )}
                {(form.status === 2 || form.status === 3) && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({...f, status: 4}))}
                    className="rounded border border-subtle px-3 py-1.5 text-13 text-secondary hover:border-accent-primary hover:text-accent-primary"
                  >
                    Finalizar
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded px-3 py-1.5 text-13 text-secondary hover:text-primary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || isFinalized}
              className="rounded bg-accent-primary px-4 py-1.5 text-13 font-medium text-white hover:bg-accent-primary/90 disabled:opacity-50"
            >
              {saving ? "Salvando..." : isFinalized ? "Visita finalizada" : "Salvar alterações"}
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
  const {currentWorkspace} = useWorkspace();
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingVisit, setEditingVisit] = useState<any | null>(null);
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
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 rounded bg-accent-primary px-3 py-2 text-13 font-medium text-white hover:bg-accent-primary/90"
        >
          <Plus className="h-4 w-4" />
          Nova Visita
        </button>
      </div>

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
              onClick={() => setEditingVisit(visit)}
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
                    onClick={(e) => { e.stopPropagation(); setEditingVisit(visit); }}
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

      {editingVisit && (
        <VisitEditorModal
          visit={editingVisit}
          onClose={() => setEditingVisit(null)}
          onSave={async (visitId, data) => {
            const updated = await visitService.update(workspaceSlug.toString(), visitId, data);
            setVisits((vs) => vs.map((v) => v.id === visitId ? {...v, ...updated} : v));
            setEditingVisit((prev: any) => prev ? {...prev, ...updated} : null);
          }}
        />
      )}
    </div>
  );
}

export default observer(TechnicalVisitsPage);
