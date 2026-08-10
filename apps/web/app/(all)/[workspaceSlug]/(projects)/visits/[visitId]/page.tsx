"use client";

import {PageHead} from "@/components/core/page-title";
import {RichTextEditor} from "@/components/editor/rich-text";
import {PrintButton, TechnicalVisitPrintDocument} from "@/components/print";
import {useEditorAsset} from "@/hooks/store/use-editor-asset";
import {useProject} from "@/hooks/store/use-project";
import {useWorkspace} from "@/hooks/store/use-workspace";
import {APIService} from "@/services/api.service";
import {WorkspaceService} from "@/services/workspace.service";
import {API_BASE_URL} from "@plane/constants";
import type {EditorRefApi} from "@plane/editor";
import {EFileAssetType} from "@plane/types";
import {cn} from "@plane/utils";
import {Building2, Calendar, Check, ChevronLeft, Layers, Save} from "lucide-react";
import {observer} from "mobx-react";
import {SelectPesquisavel} from "@/components/common/select-pesquisavel";
import {useParams, useRouter} from "next/navigation";
import {useEffect, useRef, useState} from "react";

class TechnicalVisitService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }
  retrieve(slug: string, id: string) {
    return this.get(`/api/workspaces/${slug}/technical-visits/${id}/`)
      .then((r) => r?.data)
      .catch(() => null);
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
const workspaceService = new WorkspaceService();

const STATUS_LABELS = ["Agendada", "Em Andamento", "Relatório", "Aguard. Assinatura", "Concluída", "Cancelada"];
const STATUS_COLORS: Record<number, string> = {
  0: "bg-blue-100 text-blue-800",
  1: "bg-yellow-100 text-yellow-800",
  2: "bg-purple-100 text-purple-800",
  3: "bg-orange-100 text-orange-800",
  4: "bg-green-100 text-green-800",
  5: "bg-red-100 text-red-800",
};

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

function VisitNotFound() {
  const router = useRouter();
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="rounded-lg border border-subtle bg-surface-1 p-6 text-center">
        <h1 className="text-base font-semibold">Visita não encontrada</h1>
        <p className="mt-2 text-13 text-secondary">A visita pode ter sido removida ou você não tem acesso a ela.</p>
        <button
          type="button"
          onClick={() => router.back()}
          className="mt-4 inline-flex items-center gap-2 rounded bg-accent-primary px-3 py-2 text-13 font-medium text-white"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </button>
      </div>
    </div>
  );
}

function TechnicalVisitDetailPage() {
  const router = useRouter();
  const {workspaceSlug, visitId} = useParams();
  const {currentWorkspace} = useWorkspace();
  const {joinedProjectIds, getProjectById} = useProject();
  const {uploadEditorAsset, duplicateEditorAsset} = useEditorAsset();
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const editorRef = useRef<EditorRefApi>(null);
  const conclusionEditorRef = useRef<EditorRefApi>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [visit, setVisit] = useState<any | null>(null);
  const [workspaceDetails, setWorkspaceDetails] = useState<any | null>(null);
  const [form, setForm] = useState({
    entity_id: null as string | null,
    city: "",
    scheduled_date: "",
    contacts: "",
    status: 0,
    started_at: "",
    finished_at: "",
    period: "",
    summary: "",
    conclusion: "",
    mot_update: false,
    mot_bug_fix: false,
    mot_training: false,
    mot_improvement: false,
    mot_commercial: false,
    mot_other: false,
    mot_other_description: "",
  });

  useEffect(() => {
    if (currentWorkspace) setWorkspaceDetails(currentWorkspace);
  }, [currentWorkspace]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    visitService.retrieve(workspaceSlug.toString(), visitId.toString()).then((data) => {
      if (!alive) return;
      if (!data) {
        setVisit(null);
        setLoading(false);
        return;
      }
      setVisit(data);
      setProjectIds(Array.isArray(data.project_ids) ? data.project_ids : []);
      setForm({
        entity_id: data.entity_id ?? data.entity?.id ?? null,
        city: data.city ?? "",
        scheduled_date: toDateTimeLocal(data.scheduled_date),
        contacts: data.contacts ?? "",
        status: data.status ?? 0,
        started_at: toDateTimeLocal(data.started_at),
        finished_at: toDateTimeLocal(data.finished_at),
        period: data.period ?? "",
        summary: data.summary ?? "",
        conclusion: data.conclusion ?? "",
        mot_update: !!data.mot_update,
        mot_bug_fix: !!data.mot_bug_fix,
        mot_training: !!data.mot_training,
        mot_improvement: !!data.mot_improvement,
        mot_commercial: !!data.mot_commercial,
        mot_other: !!data.mot_other,
        mot_other_description: data.mot_other_description ?? "",
      });
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [visitId, workspaceSlug]);

  const isFinalized = form.status === 4 || form.status === 5;
  const canEdit = !isFinalized;

  const updateField = (key: keyof typeof form, value: any) => setForm((current) => ({...current, [key]: value}));

  const handleSave = async () => {
    if (!visit?.id) return;
    setSaving(true);
    try {
      const updated = await visitService.update(workspaceSlug.toString(), visit.id, {
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
      setVisit(updated);
    } finally {
      setSaving(false);
    }
  };

  const handleQuickTransition = async (nextStatus: number) => {
    if (!visit?.id) return;
    setSaving(true);
    try {
      const updated = await visitService.update(workspaceSlug.toString(), visit.id, {status: nextStatus});
      setVisit(updated);
      setForm((current) => ({
        ...current,
        status: updated.status,
        started_at: updated.started_at ? toDateTimeLocal(updated.started_at) : current.started_at,
        finished_at: updated.finished_at ? toDateTimeLocal(updated.finished_at) : current.finished_at,
      }));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center p-6 text-secondary">Carregando visita...</div>;
  }

  if (!visit) return <VisitNotFound />;

  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - Visita Técnica` : "Visita Técnica";

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <PageHead title={pageTitle} />
      <TechnicalVisitPrintDocument visit={{...visit, ...form}} />

      <div className="flex items-center justify-between border-b border-subtle px-6 py-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="mt-0.5 rounded border border-subtle p-2 text-secondary hover:text-primary"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">Editar Visita Técnica</h1>
              <StatusBadge
                status={form.status}
                label={visit.status_label}
              />
            </div>
            <p className="text-13 text-secondary">
              {visit.entity?.name ?? "Sem entidade"}
              {visit.visit_number ? ` · #${visit.visit_number}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PrintButton
            documentTitle={`Visita técnica ${visit.visit_number ? `#${visit.visit_number}` : ""}`.trim()}
            auditEntity="technical_visit"
            auditEntityId={visit.id}
          />
          {canEdit && form.status === 0 && (
            <button
              type="button"
              onClick={() => handleQuickTransition(1)}
              disabled={saving}
              className="rounded border border-subtle px-3 py-2 text-13 text-secondary hover:border-accent-primary hover:text-accent-primary disabled:opacity-50"
            >
              Iniciar visita
            </button>
          )}
          {canEdit && form.status === 1 && (
            <button
              type="button"
              onClick={() => handleQuickTransition(2)}
              disabled={saving}
              className="rounded border border-subtle px-3 py-2 text-13 text-secondary hover:border-accent-primary hover:text-accent-primary disabled:opacity-50"
            >
              Iniciar relatório
            </button>
          )}
          {canEdit && (form.status === 2 || form.status === 3) && (
            <button
              type="button"
              onClick={() => handleQuickTransition(4)}
              disabled={saving}
              className="rounded border border-subtle px-3 py-2 text-13 text-secondary hover:border-accent-primary hover:text-accent-primary disabled:opacity-50"
            >
              Finalizar
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !canEdit}
            className="inline-flex items-center gap-2 rounded bg-accent-primary px-4 py-2 text-13 font-medium text-white hover:bg-accent-primary/90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : canEdit ? "Salvar alterações" : "Visita finalizada"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-4 rounded-lg border border-subtle bg-surface-1 p-5">
            <div>
              <label className="mb-1 block text-12 text-secondary">Cidade</label>
              <input
                value={form.city}
                onChange={(e) => updateField("city", e.target.value)}
                disabled={!canEdit}
                className="w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-13 outline-none focus:border-accent-primary disabled:opacity-60"
              />
            </div>
            <div>
              <label className="mb-1 block text-12 text-secondary">Data agendada</label>
              <input
                type="datetime-local"
                value={form.scheduled_date}
                onChange={(e) => updateField("scheduled_date", e.target.value)}
                disabled={!canEdit}
                className="w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-13 outline-none focus:border-accent-primary disabled:opacity-60"
              />
            </div>
            <div>
              <label className="mb-1 block text-12 text-secondary">Contatos</label>
              <input
                value={form.contacts}
                onChange={(e) => updateField("contacts", e.target.value)}
                disabled={!canEdit}
                className="w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-13 outline-none focus:border-accent-primary disabled:opacity-60"
              />
            </div>
            <div>
              <label className="mb-1 block text-12 text-secondary">Status</label>
              <SelectPesquisavel
                value={form.status}
                onChange={(valor) => updateField("status", Number(valor))}
                opcoes={STATUS_LABELS.map((label, index) => ({value: index, label}))}
                disabled={!canEdit}
                buttonClassName="disabled:opacity-60"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-12 text-secondary">Início</label>
                <input
                  type="datetime-local"
                  value={form.started_at}
                  onChange={(e) => updateField("started_at", e.target.value)}
                  disabled={!canEdit}
                  className="w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-13 outline-none focus:border-accent-primary disabled:opacity-60"
                />
              </div>
              <div>
                <label className="mb-1 block text-12 text-secondary">Fim</label>
                <input
                  type="datetime-local"
                  value={form.finished_at}
                  onChange={(e) => updateField("finished_at", e.target.value)}
                  disabled={!canEdit}
                  className="w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-13 outline-none focus:border-accent-primary disabled:opacity-60"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-12 text-secondary">Período</label>
              <input
                value={form.period}
                onChange={(e) => updateField("period", e.target.value)}
                disabled={!canEdit}
                className="w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-13 outline-none focus:border-accent-primary disabled:opacity-60"
                placeholder="Ex.: Manhã"
              />
            </div>

            <div>
              <label className="mb-1 block text-12 text-secondary">Sistemas atendidos</label>
              <div className="rounded border border-subtle bg-surface-2 max-h-48 overflow-y-auto">
                {(joinedProjectIds ?? []).length === 0 && <p className="px-3 py-2 text-13 text-tertiary">Nenhum projeto disponível</p>}
                {(joinedProjectIds ?? []).map((pid) => {
                  const proj = getProjectById(pid);
                  if (!proj) return null;
                  const selected = projectIds.includes(pid);
                  return (
                    <button
                      key={pid}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => setProjectIds((ids) => (selected ? ids.filter((id) => id !== pid) : [...ids, pid]))}
                      className={cn(
                        "flex w-full items-center gap-2 border-b border-subtle px-3 py-2 text-13 last:border-0 hover:bg-surface-1 disabled:opacity-60",
                        selected && "bg-accent-primary/10 text-accent-primary",
                      )}
                    >
                      <Layers className="h-3.5 w-3.5 shrink-0" />
                      <span className="flex-1 truncate text-left">{proj.name}</span>
                      {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["mot_update", "Atualização"],
                  ["mot_bug_fix", "Correção"],
                  ["mot_training", "Treinamento"],
                  ["mot_improvement", "Melhoria"],
                  ["mot_commercial", "Comercial"],
                  ["mot_other", "Outro"],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-2 rounded border border-subtle px-3 py-2 text-13"
                >
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={(e) => updateField(key, e.target.checked)}
                    disabled={!canEdit}
                  />
                  {label}
                </label>
              ))}
            </div>
            <div>
              <label className="mb-1 block text-12 text-secondary">Descrição do outro motivo</label>
              <input
                value={form.mot_other_description}
                onChange={(e) => updateField("mot_other_description", e.target.value)}
                disabled={!canEdit}
                className="w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-13 outline-none focus:border-accent-primary disabled:opacity-60"
              />
            </div>
          </div>

          <div className="space-y-6 rounded-lg border border-subtle bg-surface-1 p-5">
            <section>
              <div className="mb-3 flex items-center gap-2 text-13 font-medium">
                <Calendar className="h-4 w-4 text-secondary" />
                Resumo da visita
              </div>
              {workspaceDetails && (
                <RichTextEditor
                  editable={canEdit}
                  ref={editorRef}
                  id={`visit-summary-${visit.id}`}
                  initialValue={form.summary || "<p></p>"}
                  workspaceSlug={workspaceSlug.toString()}
                  workspaceId={workspaceDetails.id}
                  projectId={undefined}
                  dragDropEnabled
                  onChange={(_json, html) => updateField("summary", html)}
                  placeholder="Descreva o resumo da visita"
                  searchMentionCallback={async (payload) =>
                    await workspaceService.searchEntity(workspaceSlug.toString(), {
                      ...payload,
                      project_id: "",
                    })
                  }
                  containerClassName="min-h-[180px]"
                  uploadFile={async (blockId, file) => {
                    const {asset_id} = await uploadEditorAsset({
                      blockId,
                      data: {
                        entity_identifier: visit.id,
                        entity_type: EFileAssetType.ISSUE_DESCRIPTION,
                      },
                      file,
                      projectId: undefined,
                      workspaceSlug: workspaceSlug.toString(),
                    });
                    return asset_id;
                  }}
                  duplicateFile={async (assetId: string) => {
                    const {asset_id} = await duplicateEditorAsset({
                      assetId,
                      entityType: EFileAssetType.ISSUE_DESCRIPTION,
                      projectId: undefined,
                      workspaceSlug: workspaceSlug.toString(),
                    });
                    return asset_id;
                  }}
                />
              )}
            </section>

            <section>
              <div className="mb-3 flex items-center gap-2 text-13 font-medium">
                <Building2 className="h-4 w-4 text-secondary" />
                Conclusão
              </div>
              {workspaceDetails && (
                <RichTextEditor
                  editable={canEdit}
                  ref={conclusionEditorRef}
                  id={`visit-conclusion-${visit.id}`}
                  initialValue={form.conclusion || "<p></p>"}
                  workspaceSlug={workspaceSlug.toString()}
                  workspaceId={workspaceDetails.id}
                  projectId={undefined}
                  dragDropEnabled
                  onChange={(_json, html) => updateField("conclusion", html)}
                  placeholder="Registre a conclusão da visita"
                  searchMentionCallback={async (payload) =>
                    await workspaceService.searchEntity(workspaceSlug.toString(), {
                      ...payload,
                      project_id: "",
                    })
                  }
                  containerClassName="min-h-[180px]"
                  uploadFile={async (blockId, file) => {
                    const {asset_id} = await uploadEditorAsset({
                      blockId,
                      data: {
                        entity_identifier: visit.id,
                        entity_type: EFileAssetType.ISSUE_DESCRIPTION,
                      },
                      file,
                      projectId: undefined,
                      workspaceSlug: workspaceSlug.toString(),
                    });
                    return asset_id;
                  }}
                  duplicateFile={async (assetId: string) => {
                    const {asset_id} = await duplicateEditorAsset({
                      assetId,
                      entityType: EFileAssetType.ISSUE_DESCRIPTION,
                      projectId: undefined,
                      workspaceSlug: workspaceSlug.toString(),
                    });
                    return asset_id;
                  }}
                />
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

export default observer(TechnicalVisitDetailPage);
