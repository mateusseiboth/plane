/**
 * Detalhe da visita técnica: agenda (técnicos, entidade, data), relatório,
 * chamados vinculados, anexos, impressão e as trocas de situação.
 *
 * O que fica habilitado segue `getVisitEditMode`; a API confere de novo.
 */
import { useState } from "react";
import { observer } from "mobx-react";
import { useRouter } from "next/navigation";
import { Ban, Check, ChevronLeft, ClipboardList, Layers, Printer, Save } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";
import { EntityDropdown } from "@/components/dropdowns/entity";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { SeletorDeContatos } from "@/components/entity-contacts";
import { TechnicalVisitPrintDocument, TechnicalVisitTrainingPrintDocument, usePrint } from "@/components/print";
import { useProject } from "@/hooks/store/use-project";
import { useUser } from "@/hooks/store/user";
import { useAuditRecorder } from "@/hooks/use-audit-logs";
import { useVisitPermissions } from "@/hooks/use-technical-visits";
import { technicalVisitService } from "@/services/technical-visit.service";
import type { TTechnicalVisit, TVisitApiError, TVisitPrintTarget } from "./types";
import { VisitAttachments } from "./visit-attachments";
import {
  INPUT_CLASS,
  VISIT_MOTIVOS,
  VisitFieldError,
  VisitOverdueBadge,
  VisitStatusBadge,
  fromDateTimeLocal,
  toDateTimeLocal,
  type TVisitMotivoKey,
} from "./visit-display";
import { VisitLinkedIssues } from "./visit-linked-issues";
import { VisitModulesPicker, useVisitModules } from "./visit-modules-picker";
import { VisitReportEditors } from "./visit-report-editors";
import { VISIT_STATUS, getVisitEditMode, isVisitaEncerrada, mapVisitErrors, type TVisitEditMode } from "./visit-rules";

type TForm = {
  technician_id: string | null;
  technician2_id: string | null;
  entity_id: string | null;
  city: string;
  scheduled_date: string;
  started_at: string;
  finished_at: string;
  period: string;
  summary: string;
  conclusion: string;
  mot_other_description: string;
  project_ids: string[];
  module_ids: string[];
  contact_ids: string[];
} & Record<TVisitMotivoKey, boolean>;

const buildForm = (visit: TTechnicalVisit): TForm => ({
  technician_id: visit.technician_id,
  technician2_id: visit.technician2_id,
  entity_id: visit.entity_id,
  city: visit.city ?? "",
  scheduled_date: toDateTimeLocal(visit.scheduled_date),
  started_at: toDateTimeLocal(visit.started_at),
  finished_at: toDateTimeLocal(visit.finished_at),
  period: visit.period ?? "",
  summary: visit.summary ?? "",
  conclusion: visit.conclusion ?? "",
  mot_other_description: visit.mot_other_description ?? "",
  project_ids: visit.project_ids,
  module_ids: visit.module_ids,
  contact_ids: visit.contact_records.map((c) => c.id),
  mot_update: visit.mot_update,
  mot_bug_fix: visit.mot_bug_fix,
  mot_training: visit.mot_training,
  mot_improvement: visit.mot_improvement,
  mot_commercial: visit.mot_commercial,
  mot_other: visit.mot_other,
});

/** Agenda (técnico e data) só vai no corpo de quem pode trocá-la. */
const buildAgenda = (form: TForm, mode: TVisitEditMode) =>
  mode === "tudo" ? { technician_id: form.technician_id, scheduled_date: fromDateTimeLocal(form.scheduled_date) } : {};

const buildPayload = (form: TForm, mode: TVisitEditMode, moduloValido: (id: string) => boolean) => ({
  ...buildAgenda(form, mode),
  technician2_id: form.technician2_id,
  entity_id: form.entity_id,
  city: form.city,
  started_at: fromDateTimeLocal(form.started_at),
  finished_at: fromDateTimeLocal(form.finished_at),
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
  project_ids: form.project_ids,
  // Funcionalidade de sistema desmarcado sai junto com ele.
  module_ids: form.module_ids.filter(moduloValido),
  contact_ids: form.contact_ids,
});

type TTransicao = { para: number; label: string; sucesso: string; de: readonly number[] };

// Troca de situação é um "salvar" com a situação nova: a trava de encerramento
// da API confere o que está na tela, não o que estava gravado.
const TRANSICOES: readonly TTransicao[] = [
  {
    para: VISIT_STATUS.EM_ANDAMENTO,
    label: "Iniciar visita",
    sucesso: "Visita iniciada.",
    de: [VISIT_STATUS.AGENDADA],
  },
  {
    para: VISIT_STATUS.RELATORIO,
    label: "Iniciar relatório",
    sucesso: "Relatório iniciado.",
    de: [VISIT_STATUS.EM_ANDAMENTO],
  },
  {
    para: VISIT_STATUS.AGUARDANDO_ASSINATURA,
    label: "Enviar para assinatura",
    sucesso: "Imprima o relatório e colha a assinatura.",
    de: [VISIT_STATUS.EM_ANDAMENTO, VISIT_STATUS.RELATORIO],
  },
  {
    para: VISIT_STATUS.CONCLUIDA,
    label: "Concluir",
    sucesso: "Visita concluída.",
    de: [VISIT_STATUS.EM_ANDAMENTO, VISIT_STATUS.RELATORIO, VISIT_STATUS.AGUARDANDO_ASSINATURA],
  },
];

const BOTAO =
  "rounded border border-subtle px-3 py-2 text-13 text-secondary hover:border-accent-primary hover:text-accent-primary disabled:opacity-50";

type Props = {
  workspaceSlug: string;
  visit: TTechnicalVisit;
  onSaved: (visit: TTechnicalVisit) => void;
};

export const VisitDetail = observer(function VisitDetail({ workspaceSlug, visit, onSaved }: Props) {
  const router = useRouter();
  const { data: currentUser } = useUser();
  const { joinedProjectIds, getProjectById } = useProject();
  const permissoes = useVisitPermissions(workspaceSlug);
  const { print } = usePrint();
  const recordAudit = useAuditRecorder(workspaceSlug);
  const [form, setForm] = useState<TForm>(() => buildForm(visit));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [printTarget, setPrintTarget] = useState<TVisitPrintTarget>("relatorio");
  const { modules, isLoading: loadingModules } = useVisitModules(workspaceSlug, form.project_ids);

  const mode = getVisitEditMode(visit, currentUser?.id, permissoes);
  const canReport = mode !== "leitura";
  const canSchedule = mode === "tudo";
  // Enquanto os módulos carregam, nada é podado: senão o salvar apagaria as funcionalidades.
  const moduloValido = (id: string) => loadingModules || modules.some((m) => m.id === id);

  const update = <K extends keyof TForm>(key: K, value: TForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const applySaved = (salva: TTechnicalVisit) => {
    onSaved(salva);
    setForm(buildForm(salva));
    setErrors({});
  };

  const onFalha = (titulo: string) => (erro: unknown) => {
    setErrors(mapVisitErrors(erro));
    setToast({ type: TOAST_TYPE.ERROR, title: titulo, message: (erro as TVisitApiError)?.detail });
  };

  const save = async (extra: Record<string, unknown> = {}, sucesso = "Visita salva.") => {
    setSaving(true);
    try {
      const payload = { ...buildPayload(form, mode, moduloValido), ...extra };
      applySaved(await technicalVisitService.update(workspaceSlug, visit.id, payload));
      setToast({ type: TOAST_TYPE.SUCCESS, title: sucesso });
    } catch (erro) {
      onFalha("Não foi possível salvar a visita.")(erro);
    } finally {
      setSaving(false);
    }
  };

  const onCancel = async () => {
    if (!window.confirm("Cancelar esta visita?")) return;
    setSaving(true);
    try {
      applySaved(await technicalVisitService.update(workspaceSlug, visit.id, { status: VISIT_STATUS.CANCELADA }));
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Visita cancelada." });
    } catch (erro) {
      onFalha("Não foi possível cancelar a visita.")(erro);
    } finally {
      setSaving(false);
    }
  };

  const onPrint = (alvo: TVisitPrintTarget) => {
    setPrintTarget(alvo);
    recordAudit("print", "technical_visit", visit.id, { documento: alvo });
    const titulo = alvo === "presenca" ? "Lista de presença" : "Relatório da visita";
    print({ documentTitle: `${titulo} ${visit.visit_number ?? ""}`.trim() });
  };

  const onToggleProject = (projectId: string) =>
    update(
      "project_ids",
      form.project_ids.includes(projectId)
        ? form.project_ids.filter((id) => id !== projectId)
        : [...form.project_ids, projectId]
    );

  const transicoes = canReport ? TRANSICOES.filter((t) => t.de.includes(visit.status)) : [];
  const docVisit = {
    ...visit,
    city: form.city,
    period: form.period,
    summary: form.summary,
    conclusion: form.conclusion,
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <TechnicalVisitPrintDocument visit={docVisit} skip={printTarget !== "relatorio"} />
      <TechnicalVisitTrainingPrintDocument visit={docVisit} skip={printTarget !== "presenca"} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle px-6 py-4">
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
              <h1 className="text-lg font-semibold">
                Visita {visit.visit_number ? `nº ${visit.visit_number}` : "técnica"}
              </h1>
              <VisitStatusBadge status={visit.status} label={visit.status_label} />
              {visit.is_overdue && <VisitOverdueBadge />}
            </div>
            <p className="text-13 text-secondary">{visit.entity?.name ?? "Sem entidade"}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onPrint("relatorio")}
            className={cn(BOTAO, "inline-flex items-center gap-1.5")}
          >
            <Printer className="h-4 w-4" />
            Relatório
          </button>
          <button
            type="button"
            onClick={() => onPrint("presenca")}
            className={cn(BOTAO, "inline-flex items-center gap-1.5")}
          >
            <ClipboardList className="h-4 w-4" />
            Lista de presença
          </button>
          {transicoes.map((t) => (
            <button
              key={t.para}
              type="button"
              disabled={saving}
              onClick={() => save({ status: t.para }, t.sucesso)}
              className={BOTAO}
            >
              {t.label}
            </button>
          ))}
          {canSchedule && !isVisitaEncerrada(visit.status) && (
            <button
              type="button"
              disabled={saving}
              onClick={onCancel}
              className={cn(BOTAO, "inline-flex items-center gap-1.5 hover:text-danger-primary")}
            >
              <Ban className="h-4 w-4" />
              Cancelar visita
            </button>
          )}
          {canReport && (
            <button
              type="button"
              onClick={() => save()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded bg-accent-primary px-4 py-2 text-13 font-medium text-white hover:bg-accent-primary/90 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? "Salvando..." : "Salvar"}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="space-y-4 rounded-lg border border-subtle bg-surface-1 p-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-12 text-secondary">Técnico</label>
                <MemberDropdown
                  value={form.technician_id}
                  onChange={(id) => update("technician_id", id)}
                  multiple={false}
                  buttonVariant="border-with-text"
                  placeholder="Técnico"
                  disabled={!canSchedule}
                  className="w-full"
                  buttonClassName="w-full"
                />
                <VisitFieldError message={errors.technician_id} />
              </div>
              <div>
                <label className="mb-1 block text-12 text-secondary">2º técnico</label>
                <MemberDropdown
                  value={form.technician2_id}
                  onChange={(id) => update("technician2_id", id)}
                  multiple={false}
                  buttonVariant="border-with-text"
                  placeholder="Nenhum"
                  disabled={!canReport}
                  className="w-full"
                  buttonClassName="w-full"
                />
                <VisitFieldError message={errors.technician2_id} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-12 text-secondary">Entidade</label>
              <EntityDropdown
                workspaceSlug={workspaceSlug}
                value={form.entity_id}
                onChange={(entityId, entity) =>
                  setForm((f) => ({ ...f, entity_id: entityId, city: entity?.city ?? f.city }))
                }
                placeholder={visit.entity?.name ?? "Selecionar entidade"}
                disabled={!canReport}
                className="w-full"
              />
              <VisitFieldError message={errors.entity_id} />
            </div>
            <div>
              <label className="mb-1 block text-12 text-secondary">Cidade</label>
              <input
                value={form.city}
                onChange={(e) => update("city", e.target.value)}
                disabled={!canReport}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="mb-1 block text-12 text-secondary">Data agendada</label>
              <input
                type="datetime-local"
                value={form.scheduled_date}
                onChange={(e) => update("scheduled_date", e.target.value)}
                disabled={!canSchedule}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="mb-1 block text-12 text-secondary">Responsáveis</label>
              <SeletorDeContatos
                workspaceSlug={workspaceSlug}
                entityId={form.entity_id}
                value={form.contact_ids}
                onChange={(ids) => update("contact_ids", ids)}
                contatosConhecidos={visit.contact_records}
                textoLegado={visit.contacts}
                disabled={!canReport}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-12 text-secondary">Início (chegada)</label>
                <input
                  type="datetime-local"
                  value={form.started_at}
                  onChange={(e) => update("started_at", e.target.value)}
                  disabled={!canReport}
                  className={INPUT_CLASS}
                />
                <VisitFieldError message={errors.started_at} />
              </div>
              <div>
                <label className="mb-1 block text-12 text-secondary">Fim (partida)</label>
                <input
                  type="datetime-local"
                  value={form.finished_at}
                  onChange={(e) => update("finished_at", e.target.value)}
                  disabled={!canReport}
                  className={INPUT_CLASS}
                />
                <VisitFieldError message={errors.finished_at} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-12 text-secondary">Período</label>
              <input
                value={form.period}
                onChange={(e) => update("period", e.target.value)}
                disabled={!canReport}
                className={INPUT_CLASS}
                placeholder="Ex.: manhã"
              />
            </div>

            <div>
              <label className="mb-1 block text-12 text-secondary">Sistemas atendidos</label>
              <div className="max-h-48 overflow-y-auto rounded border border-subtle bg-surface-2">
                {(joinedProjectIds ?? []).map((pid) => {
                  const projeto = getProjectById(pid);
                  if (!projeto) return null;
                  const marcado = form.project_ids.includes(pid);
                  return (
                    <button
                      key={pid}
                      type="button"
                      disabled={!canReport}
                      onClick={() => onToggleProject(pid)}
                      className={cn(
                        "flex w-full items-center gap-2 border-b border-subtle px-3 py-2 text-13 last:border-0 hover:bg-surface-1 disabled:opacity-60",
                        marcado && "bg-accent-primary/10 text-accent-primary"
                      )}
                    >
                      <Layers className="h-3.5 w-3.5 shrink-0" />
                      <span className="flex-1 truncate text-left">{projeto.name}</span>
                      {marcado && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
              <VisitFieldError message={errors.project_ids} />
            </div>

            <div>
              <label className="mb-1 block text-12 text-secondary">Funcionalidades</label>
              <VisitModulesPicker
                modules={modules}
                isLoading={loadingModules}
                hasProjects={form.project_ids.length > 0}
                value={form.module_ids}
                onChange={(ids) => update("module_ids", ids)}
                disabled={!canReport}
              />
              <VisitFieldError message={errors.module_ids} />
            </div>

            <div>
              <label className="mb-1 block text-12 text-secondary">Motivos da visita</label>
              <div className="grid gap-2 sm:grid-cols-2">
                {VISIT_MOTIVOS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 rounded border border-subtle px-3 py-2 text-13">
                    <input
                      type="checkbox"
                      checked={form[key]}
                      onChange={(e) => update(key, e.target.checked)}
                      disabled={!canReport}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <VisitFieldError message={errors.motivos} />
            </div>
            {form.mot_other && (
              <div>
                <label className="mb-1 block text-12 text-secondary">Qual outro motivo</label>
                <input
                  value={form.mot_other_description}
                  onChange={(e) => update("mot_other_description", e.target.value)}
                  disabled={!canReport}
                  className={INPUT_CLASS}
                />
              </div>
            )}
          </div>

          <div className="space-y-6 rounded-lg border border-subtle bg-surface-1 p-5">
            <VisitReportEditors
              workspaceSlug={workspaceSlug}
              visitId={visit.id}
              editable={canReport}
              summary={form.summary}
              conclusion={form.conclusion}
              onSummaryChange={(html) => update("summary", html)}
              onConclusionChange={(html) => update("conclusion", html)}
              errors={{ summary: errors.summary, conclusion: errors.conclusion }}
            />
            <VisitLinkedIssues
              workspaceSlug={workspaceSlug}
              visit={visit}
              editable={canReport}
              error={errors.issues}
              onChange={onSaved}
            />
            <VisitAttachments
              workspaceSlug={workspaceSlug}
              visit={visit}
              editable={canReport}
              onChange={onSaved}
              onErrors={setErrors}
            />
          </div>
        </div>
      </div>
    </div>
  );
});
