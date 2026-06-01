import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Plus, Trash2, X, Shield } from "lucide-react";
import { EProjectAction, PROJECT_ACTION_LABELS } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { Dialog, EDialogWidth } from "@plane/propel/dialog";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import rolesService, { type TWorkflowRole, type TRoleTransition } from "@/services/roles.service";

// Standard state template (matches DEFAULT_STATES in the backend migration).
const STATE_TEMPLATE: { group: string; name: string; group_label: string }[] = [
  { group: "triage", name: "Triagem", group_label: "Triagem" },
  { group: "backlog", name: "Pendências", group_label: "Backlog" },
  { group: "unstarted", name: "A Fazer", group_label: "Não iniciado" },
  { group: "started", name: "Em Análise", group_label: "Em andamento" },
  { group: "started", name: "Em Desenvolvimento", group_label: "Em andamento" },
  { group: "started", name: "Em Teste", group_label: "Em andamento" },
  { group: "completed", name: "Concluído", group_label: "Concluído" },
  { group: "cancelled", name: "Cancelado", group_label: "Cancelado" },
];

const ACTION_KEYS = Object.values(EProjectAction) as string[];

function CreateRoleModal({
  slug,
  open,
  onClose,
  onSaved,
}: {
  slug: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [level, setLevel] = useState(10);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setLevel(10);
    }
  }, [open]);

  const submit = async () => {
    if (!name.trim()) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "Nome é obrigatório." });
      return;
    }
    setSaving(true);
    try {
      await rolesService.create(slug, { name: name.trim(), level });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Criada", message: "Função criada." });
      onSaved();
      onClose();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "Falha ao criar função." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Panel width={EDialogWidth.MD}>
        <div className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <Dialog.Title>Nova função</Dialog.Title>
            <button onClick={onClose} className="rounded p-1 text-secondary-text hover:bg-surface-2">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-secondary-text">Nome *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-sm text-primary outline-none focus:border-accent-strong"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-secondary-text">
                Nível (hierarquia: 5 visualizador … 20 admin)
              </label>
              <input
                type="number"
                value={level}
                onChange={(e) => setLevel(Number(e.target.value))}
                className="w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-sm text-primary outline-none focus:border-accent-strong"
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" loading={saving} onClick={submit}>
              Criar
            </Button>
          </div>
        </div>
      </Dialog.Panel>
    </Dialog>
  );
}

const WorkspaceRolesPage = observer(() => {
  const { currentWorkspace } = useWorkspace();
  const { allowPermissions } = useUserPermissions();
  const slug = currentWorkspace?.slug ?? "";

  const [roles, setRoles] = useState<TWorkflowRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // editable local copies for the selected role
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState<Set<string>>(new Set()); // key = `${group}::${name}`
  const [transitions, setTransitions] = useState<TRoleTransition[]>([]);
  const [savingPerms, setSavingPerms] = useState(false);
  const [savingVis, setSavingVis] = useState(false);
  const [savingTrans, setSavingTrans] = useState(false);

  const canManage = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    const data = await rolesService.list(slug);
    setRoles(data);
    setSelectedId((prev) => prev ?? data[0]?.id ?? null);
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = useMemo(() => roles.find((r) => r.id === selectedId) ?? null, [roles, selectedId]);

  // sync editable copies when selection changes
  useEffect(() => {
    if (!selected) return;
    setPerms(new Set(selected.permissions));
    // empty visibility means "sees everything" → pre-check all states for clarity
    if (selected.visibility.length === 0) {
      setVisible(new Set(STATE_TEMPLATE.map((s) => `${s.group}::${s.name}`)));
    } else {
      setVisible(
        new Set(
          selected.visibility
            .filter((v) => v.can_view)
            .flatMap((v) =>
              v.state_name
                ? [`${v.group}::${v.state_name}`]
                : STATE_TEMPLATE.filter((s) => s.group === v.group).map((s) => `${s.group}::${s.name}`)
            )
        )
      );
    }
    setTransitions(selected.transitions);
  }, [selected]);

  if (!canManage) return <NotAuthorizedView section="settings" />;

  const togglePerm = (key: string) =>
    setPerms((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const toggleVisible = (key: string) =>
    setVisible((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const savePerms = async () => {
    if (!selected) return;
    setSavingPerms(true);
    try {
      await rolesService.update(slug, selected.id, { permissions: [...perms] });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Salvo", message: "Permissões atualizadas." });
      await load();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "Falha ao salvar permissões." });
    } finally {
      setSavingPerms(false);
    }
  };

  const saveVisibility = async () => {
    if (!selected) return;
    setSavingVis(true);
    try {
      const rows = STATE_TEMPLATE.filter((s) => visible.has(`${s.group}::${s.name}`)).map((s) => ({
        group: s.group,
        state_name: s.name,
        can_view: true,
      }));
      await rolesService.setVisibility(slug, selected.id, rows);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Salvo", message: "Visibilidade atualizada." });
      await load();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "Falha ao salvar visibilidade." });
    } finally {
      setSavingVis(false);
    }
  };

  const saveTransitions = async () => {
    if (!selected) return;
    setSavingTrans(true);
    try {
      await rolesService.setTransitions(slug, selected.id, transitions);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Salvo", message: "Transições atualizadas." });
      await load();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "Falha ao salvar transições." });
    } finally {
      setSavingTrans(false);
    }
  };

  const addTransition = () =>
    setTransitions((prev) => [
      ...prev,
      { from_group: "unstarted", from_state_name: "A Fazer", to_group: "started", to_state_name: "Em Desenvolvimento", allowed: true },
    ]);

  const updateTransition = (idx: number, patch: Partial<TRoleTransition>) =>
    setTransitions((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));

  const removeTransition = (idx: number) => setTransitions((prev) => prev.filter((_, i) => i !== idx));

  const deleteRole = async (role: TWorkflowRole) => {
    if (role.is_system) return;
    if (!confirm(`Excluir a função "${role.name}"?`)) return;
    try {
      await rolesService.remove(slug, role.id);
      setSelectedId(null);
      await load();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Excluída", message: "Função excluída." });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "Falha ao excluir função." });
    }
  };

  const stateForSelect = STATE_TEMPLATE.map((s) => ({ value: `${s.group}::${s.name}`, label: `${s.name} (${s.group_label})` }));
  const parseStateKey = (k: string) => {
    const [group, name] = k.split("::");
    return { group, name };
  };

  return (
    <SettingsContentWrapper>
      <PageHead title="Funções e permissões" />
      <CreateRoleModal slug={slug} open={createOpen} onClose={() => setCreateOpen(false)} onSaved={load} />

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-subtle pb-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-medium text-primary">
              <Shield className="h-5 w-5" /> Funções e permissões
            </h3>
            <p className="text-xs text-secondary-text">
              Crie funções, defina o que cada uma pode fazer, quais quadros vê e quais transições de etapa pode realizar.
            </p>
          </div>
          <Button variant="primary" prependIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
            Nova função
          </Button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-secondary-text">Carregando...</div>
        ) : (
          <div className="flex gap-4">
            {/* role list */}
            <div className="w-56 shrink-0 space-y-1">
              {roles.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    selectedId === r.id ? "bg-surface-3 text-primary" : "text-secondary-text hover:bg-surface-2"
                  }`}
                >
                  <span>{r.name}</span>
                  {r.is_system && <span className="text-[10px] uppercase text-secondary-text">sistema</span>}
                </button>
              ))}
            </div>

            {/* role editor */}
            {selected ? (
              <div className="flex-1 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-base font-medium text-primary">{selected.name}</p>
                    <p className="text-xs text-secondary-text">
                      chave: {selected.key} · nível: {selected.level}
                    </p>
                  </div>
                  {!selected.is_system && (
                    <button
                      onClick={() => deleteRole(selected)}
                      className="rounded p-1.5 text-secondary-text hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                      title="Excluir função"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Permissions */}
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-medium text-primary">Permissões</h4>
                    <Button variant="primary" size="sm" loading={savingPerms} onClick={savePerms}>
                      Salvar permissões
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {ACTION_KEYS.map((key) => (
                      <label key={key} className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-surface-2">
                        <input type="checkbox" checked={perms.has(key)} onChange={() => togglePerm(key)} />
                        <span className="text-primary">{PROJECT_ACTION_LABELS[key as EProjectAction] ?? key}</span>
                      </label>
                    ))}
                  </div>
                </section>

                {/* Visibility */}
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-medium text-primary">Quadros visíveis</h4>
                    <Button variant="primary" size="sm" loading={savingVis} onClick={saveVisibility}>
                      Salvar visibilidade
                    </Button>
                  </div>
                  <p className="mb-2 text-[11px] text-secondary-text">
                    Marque os estados que esta função pode ver no board. (Todos marcados = vê tudo.)
                  </p>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
                    {STATE_TEMPLATE.map((s) => {
                      const key = `${s.group}::${s.name}`;
                      return (
                        <label key={key} className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-surface-2">
                          <input type="checkbox" checked={visible.has(key)} onChange={() => toggleVisible(key)} />
                          <span className="text-primary">{s.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </section>

                {/* Transitions */}
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-medium text-primary">Transições de etapa permitidas</h4>
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" prependIcon={<Plus className="h-3.5 w-3.5" />} onClick={addTransition}>
                        Adicionar
                      </Button>
                      <Button variant="primary" size="sm" loading={savingTrans} onClick={saveTransitions}>
                        Salvar transições
                      </Button>
                    </div>
                  </div>
                  <p className="mb-2 text-[11px] text-secondary-text">
                    Vazio = sem restrição via tabela (use a permissão “Mover para qualquer estado” para acesso total).
                  </p>
                  <div className="space-y-2">
                    {transitions.length === 0 && <p className="text-xs text-secondary-text">Nenhuma transição definida.</p>}
                    {transitions.map((t, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <select
                          value={`${t.from_group}::${t.from_state_name ?? ""}`}
                          onChange={(e) => {
                            const { group, name } = parseStateKey(e.target.value);
                            updateTransition(idx, { from_group: group, from_state_name: name });
                          }}
                          className="rounded border border-subtle bg-surface-2 px-2 py-1 text-xs text-primary outline-none"
                        >
                          {stateForSelect.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <span className="text-xs text-secondary-text">→</span>
                        <select
                          value={`${t.to_group}::${t.to_state_name ?? ""}`}
                          onChange={(e) => {
                            const { group, name } = parseStateKey(e.target.value);
                            updateTransition(idx, { to_group: group, to_state_name: name });
                          }}
                          className="rounded border border-subtle bg-surface-2 px-2 py-1 text-xs text-primary outline-none"
                        >
                          {stateForSelect.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => removeTransition(idx)}
                          className="rounded p-1 text-secondary-text hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            ) : (
              <div className="flex-1 py-8 text-center text-sm text-secondary-text">Selecione uma função.</div>
            )}
          </div>
        )}
      </div>
    </SettingsContentWrapper>
  );
});

export default WorkspaceRolesPage;
