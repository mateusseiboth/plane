"use client";

import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Clock } from "lucide-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { useUserPermissions } from "@/hooks/store/user";

type PrioritySla = { urgent: number; high: number; medium: number; low: number; none: number };

const PRIORITY_LABELS: Record<keyof PrioritySla, string> = {
  urgent: "Urgente",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
  none: "Sem prioridade",
};

const DEFAULTS: PrioritySla = { urgent: -8, high: -4, medium: 0, low: 8, none: 0 };

const WorkspaceSlaPage = observer(() => {
  const { allowPermissions } = useUserPermissions();
  const canManage = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  const [sla, setSla] = useState<PrioritySla>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/instances/priority-sla/`, { credentials: "include" });
      const data = await res.json();
      if (data?.priority_sla) setSla({ ...DEFAULTS, ...data.priority_sla });
    } catch {
      // keep defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!canManage) return <NotAuthorizedView section="settings" className="h-auto" />;

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/instances/priority-sla/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ priority_sla: sla }),
      });
      if (!res.ok) throw new Error();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Salvo", message: "Ajustes de SLA por prioridade atualizados." });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "Falha ao salvar. Requer admin da instância." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsContentWrapper>
      <PageHead title="SLA / Prazos" />
      <div className="flex flex-col gap-4">
        <div className="border-b border-subtle pb-3">
          <h3 className="flex items-center gap-2 text-lg font-medium text-primary">
            <Clock className="h-5 w-5" /> SLA / Prazos
          </h3>
          <p className="text-xs text-secondary-text">
            O prazo automático (data de vencimento) é definido pela label aplicada e ajustado pela prioridade. As horas
            são corridas. Configure aqui o ajuste por prioridade (negativo encurta o prazo, positivo estende). O prazo
            base de cada label é configurado na gestão de labels do projeto.
          </p>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-secondary-text">Carregando...</div>
        ) : (
          <>
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
            <div>
              <Button variant="primary" loading={saving} onClick={save}>
                Salvar
              </Button>
            </div>
          </>
        )}
      </div>
    </SettingsContentWrapper>
  );
});

export default WorkspaceSlaPage;
