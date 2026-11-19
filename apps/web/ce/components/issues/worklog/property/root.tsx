import React, { useCallback, useEffect, useState } from "react";
import { Clock, Plus, Trash2, X } from "lucide-react";
import { Button } from "@plane/propel/button";
import { Dialog, EDialogWidth } from "@plane/propel/dialog";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn, renderFormattedDate } from "@plane/utils";

type TTimeLog = {
  id: string;
  logged_date: string;
  duration_minutes: number;
  description: string | null;
};

type TIssueWorklogProperty = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
};

function minutesToDisplay(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function IssueWorklogProperty({ workspaceSlug, projectId, issueId, disabled }: TIssueWorklogProperty) {
  const [logs, setLogs] = useState<TTimeLog[]>([]);
  const [open, setOpen] = useState(false);
  const [logForm, setLogForm] = useState(false);
  const [form, setForm] = useState({
    duration_minutes: "",
    logged_date: new Date().toISOString().split("T")[0],
    description: "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/time-logs/?cursor=100:0:0`,
        { credentials: "include" }
      );
      const data = await res.json();
      setLogs(Array.isArray(data) ? data : (data.results ?? []));
    } catch {
      setLogs([]);
    }
  }, [workspaceSlug, projectId, issueId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const totalMins = logs.reduce((acc, l) => acc + (l.duration_minutes ?? 0), 0);

  const handleAdd = async () => {
    const mins = parseInt(form.duration_minutes, 10);
    if (!mins || mins <= 0) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "Informe a duração em minutos." });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/time-logs/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          duration_minutes: mins,
          logged_date: form.logged_date,
          description: form.description || null,
        }),
      });
      // `fetch` só rejeita em erro de rede: sem conferir o status, um 400 saía
      // como "Salvo" e o log simplesmente não aparecia.
      if (!res.ok) throw new Error(await res.text());
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Salvo", message: "Horas registradas." });
      setForm({ duration_minutes: "", logged_date: new Date().toISOString().split("T")[0], description: "" });
      setLogForm(false);
      load();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "Falha ao registrar horas." });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (logId: string) => {
    setDeleting(logId);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/time-logs/${logId}/`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );
      if (!res.ok) throw new Error(await res.text());
      load();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "Falha ao remover." });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "text-xs flex h-7.5 w-full items-center gap-1.5 rounded px-2 py-1 text-left transition-colors hover:bg-surface-2",
          totalMins > 0 ? "text-primary" : "text-secondary-text"
        )}
      >
        <Clock className="h-3.5 w-3.5 shrink-0" />
        <span>{totalMins > 0 ? minutesToDisplay(totalMins) : "Log de tempo"}</span>
        {!disabled && <Plus className="text-secondary-text ml-auto h-3 w-3 shrink-0" />}
      </button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) {
            setOpen(false);
            setLogForm(false);
          }
        }}
      >
        <Dialog.Panel width={EDialogWidth.MD}>
          <div className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <Dialog.Title>Log de Tempo</Dialog.Title>
                {totalMins > 0 && (
                  <p className="text-xs text-secondary-text mt-0.5">Total: {minutesToDisplay(totalMins)}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!disabled && (
                  <Button variant="primary" size="sm" onClick={() => setLogForm((v) => !v)}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-secondary-text rounded p-1 hover:bg-surface-2"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            {logForm && (
              <div className="mb-4 space-y-2 rounded-lg border border-subtle bg-surface-2 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-secondary-text mb-1 block">Duração (min) *</label>
                    <input
                      type="number"
                      min={1}
                      value={form.duration_minutes}
                      onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))}
                      className="text-sm focus:border-accent-primary w-full rounded border border-subtle bg-surface-1 px-2 py-1.5 outline-none"
                      placeholder="60"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-secondary-text mb-1 block">Data</label>
                    <input
                      type="date"
                      value={form.logged_date}
                      onChange={(e) => setForm((f) => ({ ...f, logged_date: e.target.value }))}
                      className="text-sm focus:border-accent-primary w-full rounded border border-subtle bg-surface-1 px-2 py-1.5 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-secondary-text mb-1 block">Descrição</label>
                  <input
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    className="text-sm focus:border-accent-primary w-full rounded border border-subtle bg-surface-1 px-2 py-1.5 outline-none"
                    placeholder="O que foi feito..."
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setLogForm(false)}>
                    Cancelar
                  </Button>
                  <Button variant="primary" size="sm" onClick={handleAdd} loading={saving}>
                    Salvar
                  </Button>
                </div>
              </div>
            )}
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {logs.length === 0 ? (
                <p className="text-sm text-secondary-text py-6 text-center">Nenhum log registrado.</p>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start justify-between rounded-lg border border-subtle bg-surface-2 px-3 py-2.5"
                  >
                    <div className="flex items-start gap-2">
                      <Clock className="text-secondary-text mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{minutesToDisplay(log.duration_minutes)}</p>
                        <p className="text-xs text-secondary-text">
                          {renderFormattedDate(log.logged_date)}
                          {log.description && ` · ${log.description}`}
                        </p>
                      </div>
                    </div>
                    {!disabled && (
                      <button
                        type="button"
                        onClick={() => handleDelete(log.id)}
                        disabled={deleting === log.id}
                        className="text-secondary-text hover:text-red-500 rounded p-1 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </Dialog.Panel>
      </Dialog>
    </>
  );
}
