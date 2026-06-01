import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Clock, Tag } from "lucide-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";

type PrioritySla = { urgent: number; high: number; medium: number; low: number; none: number };
type LabelSla = { name: string; color: string; sla_hours: number | null; project_count: number };

const PRIORITY_LABELS: Record<keyof PrioritySla, string> = {
  urgent: "Urgente",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
  none: "Sem prioridade",
};

const DEFAULTS: PrioritySla = { urgent: -8, high: -4, medium: 0, low: 8, none: 0 };

// Human hint: 96 -> "4 dias", 16 -> "16h"
const hoursHint = (h: number | null) => {
  if (h === null || isNaN(h)) return "sem prazo";
  if (h % 24 === 0 && h >= 24) return `${h / 24} dia(s)`;
  return `${h}h`;
};

const WorkspaceSlaPage = observer(() => {
  const { currentWorkspace } = useWorkspace();
  const slug = currentWorkspace?.slug ?? "";
  const { allowPermissions } = useUserPermissions();
  const canManage = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  const [sla, setSla] = useState<PrioritySla>(DEFAULTS);
  const [labels, setLabels] = useState<LabelSla[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPriority, setSavingPriority] = useState(false);
  const [savingLabels, setSavingLabels] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [slaRes, labelRes] = await Promise.all([
        fetch(`/api/instances/priority-sla/`, { credentials: "include" }).then((r) => r.json()).catch(() => null),
        slug
          ? fetch(`/api/workspaces/${slug}/label-sla/`, { credentials: "include" }).then((r) => r.json()).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (slaRes?.priority_sla) setSla({ ...DEFAULTS, ...slaRes.priority_sla });
      if (labelRes?.labels) setLabels(labelRes.labels);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  if (!canManage) return <NotAuthorizedView section="settings" className="h-auto" />;

  const savePriority = async () => {
    setSavingPriority(true);
    try {
      const res = await fetch(`/api/instances/priority-sla/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ priority_sla: sla }),
      });
      if (!res.ok) throw new Error();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Salvo", message: "Ajustes por prioridade atualizados." });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "Falha ao salvar (requer admin da instância)." });
    } finally {
      setSavingPriority(false);
    }
  };

  const saveLabels = async () => {
    setSavingLabels(true);
    try {
      const res = await fetch(`/api/workspaces/${slug}/label-sla/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          labels: labels.map((l) => ({ name: l.name, color: l.color, sla_hours: l.sla_hours })),
        }),
      });
      if (!res.ok) throw new Error();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Salvo", message: "Prazos das etiquetas atualizados." });
      await load();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "Falha ao salvar prazos das etiquetas." });
    } finally {
      setSavingLabels(false);
    }
  };

  const setLabelHours = (name: string, value: string) =>
    setLabels((prev) =>
      prev.map((l) => (l.name === name ? { ...l, sla_hours: value === "" ? null : Number(value) } : l))
    );

  return (
    <SettingsContentWrapper>
      <PageHead title="SLA / Prazos" />
      <div className="flex flex-col gap-8">
        <div className="border-b border-subtle pb-3">
          <h3 className="flex items-center gap-2 text-lg font-medium text-primary">
            <Clock className="h-5 w-5" /> SLA / Prazos
          </h3>
          <p className="text-xs text-secondary-text">
            O prazo automático (data de vencimento) é definido pela <b>etiqueta</b> aplicada ao item e ajustado pela{" "}
            <b>prioridade</b>. As horas são corridas. Ao aplicar uma etiqueta com prazo, a data de vencimento é
            preenchida automaticamente se ainda não houver uma.
          </p>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-secondary-text">Carregando...</div>
        ) : (
          <>
            {/* ── Etiquetas (prazo base) ─────────────────────────────────────── */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="flex items-center gap-2 text-sm font-medium text-primary">
                  <Tag className="h-4 w-4" /> Prazo por etiqueta (a nível de workspace)
                </h4>
                <Button variant="primary" size="sm" loading={savingLabels} onClick={saveLabels}>
                  Salvar etiquetas
                </Button>
              </div>
              <p className="mb-3 text-[11px] text-secondary-text">
                Informe o prazo em horas para cada etiqueta. Vazio = sem prazo automático. Aplica-se a todos os projetos.
              </p>
              {labels.length === 0 ? (
                <p className="text-xs text-secondary-text">Nenhuma etiqueta encontrada.</p>
              ) : (
                <div className="max-w-xl space-y-2">
                  {labels.map((l) => (
                    <div key={l.name} className="flex items-center justify-between gap-3 rounded border border-subtle px-3 py-2">
                      <span className="flex items-center gap-2 text-sm text-primary">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: l.color || "#94a3b8" }} />
                        {l.name}
                        <span className="text-[10px] text-secondary-text">({l.project_count} projeto(s))</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={l.sla_hours ?? ""}
                          placeholder="—"
                          onChange={(e) => setLabelHours(l.name, e.target.value)}
                          className="w-24 rounded border border-subtle bg-surface-2 px-3 py-1.5 text-sm text-primary outline-none focus:border-accent-strong"
                        />
                        <span className="w-20 text-xs text-secondary-text">{hoursHint(l.sla_hours)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── Ajuste por prioridade ──────────────────────────────────────── */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-medium text-primary">Ajuste por prioridade</h4>
                <Button variant="primary" size="sm" loading={savingPriority} onClick={savePriority}>
                  Salvar prioridades
                </Button>
              </div>
              <p className="mb-3 text-[11px] text-secondary-text">
                Soma/subtrai horas ao prazo da etiqueta (negativo encurta, positivo estende).
              </p>
              <div className="max-w-md space-y-3">
                {(Object.keys(PRIORITY_LABELS) as (keyof PrioritySla)[]).map((p) => (
                  <div key={p} className="flex items-center justify-between gap-4">
                    <label className="text-sm text-primary">{PRIORITY_LABELS[p]}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={sla[p]}
                        onChange={(e) => setSla((prev) => ({ ...prev, [p]: Number(e.target.value) }))}
                        className="w-24 rounded border border-subtle bg-surface-2 px-3 py-1.5 text-sm text-primary outline-none focus:border-accent-strong"
                      />
                      <span className="text-xs text-secondary-text">horas</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </SettingsContentWrapper>
  );
});

export default WorkspaceSlaPage;
