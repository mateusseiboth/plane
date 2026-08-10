import {NotAuthorizedView} from "@/components/auth-screens/not-authorized-view";
import {PageHead} from "@/components/core/page-title";
import {SettingsContentWrapper} from "@/components/settings/content-wrapper";
import {useWorkspace} from "@/hooks/store/use-workspace";
import {useUserPermissions} from "@/hooks/store/user";
import entityService, {type TEntity, entityTypeLabel} from "@/services/entity.service";
import {EUserPermissions, EUserPermissionsLevel} from "@plane/constants";
import {Button} from "@plane/propel/button";
import {Dialog, EDialogWidth} from "@plane/propel/dialog";
import {TOAST_TYPE, setToast} from "@plane/propel/toast";
import {Building2, Pencil, Plus, Search, Trash2, X} from "lucide-react";
import {observer} from "mobx-react";
import {useCallback, useEffect, useState} from "react";
import type {Route} from "./+types/page";
import {SelectPesquisavel} from "@/components/common/select-pesquisavel";

const ENTITY_TYPES: {value: number; label: string}[] = [
  {value: 0, label: "Prefeitura"},
  {value: 1, label: "Câmara"},
  {value: 2, label: "Outros"},
  {value: 3, label: "Escola"},
  {value: 4, label: "Autarquia"},
  {value: 5, label: "RPPS"},
  {value: 6, label: "SAAE"},
  {value: 7, label: "Consórcio"},
];

type TEntityForm = {
  name: string;
  entity_type: number | null;
  city: string;
  state: string;
  email: string;
  phone: string;
  cnpj: string;
  is_active: boolean;
};

const EMPTY_FORM: TEntityForm = {
  name: "",
  entity_type: null,
  city: "",
  state: "",
  email: "",
  phone: "",
  cnpj: "",
  is_active: true,
};

function EntityModal({
  entity,
  workspaceSlug,
  open,
  onClose,
  onSaved,
}: {
  entity?: TEntity | null;
  workspaceSlug: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<TEntityForm>(
    entity
      ? {
          name: entity.name ?? "",
          entity_type: entity.entity_type ?? null,
          city: entity.city ?? "",
          state: entity.state ?? "",
          email: entity.email ?? "",
          phone: entity.phone ?? "",
          cnpj: entity.cnpj ?? "",
          is_active: entity.is_active ?? true,
        }
      : {...EMPTY_FORM},
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(
      entity
        ? {
            name: entity.name ?? "",
            entity_type: entity.entity_type ?? null,
            city: entity.city ?? "",
            state: entity.state ?? "",
            email: entity.email ?? "",
            phone: entity.phone ?? "",
            cnpj: entity.cnpj ?? "",
            is_active: entity.is_active ?? true,
          }
        : {...EMPTY_FORM},
    );
  }, [entity, open]);

  const handle = (field: keyof TEntityForm, value: any) => setForm((f) => ({...f, [field]: value}));

  const submit = async () => {
    if (!form.name.trim()) {
      setToast({type: TOAST_TYPE.ERROR, title: "Erro", message: "Nome é obrigatório."});
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        entity_type: form.entity_type,
        city: form.city || null,
        state: form.state || null,
        email: form.email || null,
        phone: form.phone || null,
        cnpj: form.cnpj || null,
        is_active: form.is_active,
      };
      if (entity) {
        await entityService.update(workspaceSlug, entity.id, payload);
        setToast({type: TOAST_TYPE.SUCCESS, title: "Salvo", message: "Entidade atualizada."});
      } else {
        await fetch(`/api/workspaces/${workspaceSlug}/entities/`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          credentials: "include",
          body: JSON.stringify(payload),
        });
        setToast({type: TOAST_TYPE.SUCCESS, title: "Criado", message: "Entidade criada."});
      }
      onSaved();
      onClose();
    } catch {
      setToast({type: TOAST_TYPE.ERROR, title: "Erro", message: "Falha ao salvar entidade."});
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <Dialog.Panel width={EDialogWidth.LG}>
        <div className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <Dialog.Title>{entity ? "Editar Entidade" : "Nova Entidade"}</Dialog.Title>
            <button
              onClick={onClose}
              className="rounded p-1 text-secondary-text hover:bg-surface-2 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-secondary-text">Nome *</label>
              <input
                value={form.name}
                onChange={(e) => handle("name", e.target.value)}
                className="w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-sm text-primary outline-none focus:border-accent-primary"
                placeholder="Nome da entidade"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-secondary-text">Tipo</label>
              <SelectPesquisavel
                value={form.entity_type ?? ""}
                onChange={(valor) => handle("entity_type", valor !== "" ? Number(valor) : null)}
                opcoes={ENTITY_TYPES.map((t) => ({value: t.value, label: t.label}))}
                opcaoVazia={{value: "", label: "Selecione o tipo"}}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-secondary-text">Cidade</label>
                <input
                  value={form.city}
                  onChange={(e) => handle("city", e.target.value)}
                  className="w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-sm text-primary outline-none focus:border-accent-primary"
                  placeholder="Cidade"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-secondary-text">UF</label>
                <input
                  value={form.state}
                  onChange={(e) => handle("state", e.target.value)}
                  maxLength={2}
                  className="w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-sm text-primary outline-none focus:border-accent-primary"
                  placeholder="UF"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-secondary-text">E-mail</label>
                <input
                  value={form.email}
                  onChange={(e) => handle("email", e.target.value)}
                  type="email"
                  className="w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-sm text-primary outline-none focus:border-accent-primary"
                  placeholder="contato@entidade.gov.br"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-secondary-text">Telefone</label>
                <input
                  value={form.phone}
                  onChange={(e) => handle("phone", e.target.value)}
                  className="w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-sm text-primary outline-none focus:border-accent-primary"
                  placeholder="(67) 3XXX-XXXX"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-secondary-text">CNPJ</label>
              <input
                value={form.cnpj}
                onChange={(e) => handle("cnpj", e.target.value)}
                className="w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-sm text-primary outline-none focus:border-accent-primary"
                placeholder="00.000.000/0001-00"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="is_active"
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => handle("is_active", e.target.checked)}
                className="h-4 w-4 rounded accent-accent-primary"
              />
              <label
                htmlFor="is_active"
                className="text-sm text-primary"
              >
                Ativa
              </label>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button
              variant="secondary"
              size="lg"
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={submit}
              loading={saving}
            >
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </Dialog.Panel>
    </Dialog>
  );
}

const WorkspaceEntitiesPage = observer(function WorkspaceEntitiesPage({params}: Route.ComponentProps) {
  const {workspaceSlug} = params;
  const {allowPermissions} = useUserPermissions();
  const {currentWorkspace} = useWorkspace();

  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  const [entities, setEntities] = useState<TEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<number | null>(null);
  const [modal, setModal] = useState<{open: boolean; entity?: TEntity | null}>({open: false});
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/entities/?cursor=5000:0:0`, {credentials: "include"});
      const data = await res.json();
      setEntities(Array.isArray(data) ? data : (data.results ?? []));
    } catch {
      setEntities([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (entityId: string) => {
    if (!confirm("Confirmar exclusão desta entidade?")) return;
    try {
      await fetch(`/api/workspaces/${workspaceSlug}/entities/${entityId}/`, {method: "DELETE", credentials: "include"});
      setToast({type: TOAST_TYPE.SUCCESS, title: "Excluído", message: "Entidade removida."});
      load();
    } catch {
      setToast({type: TOAST_TYPE.ERROR, title: "Erro", message: "Falha ao excluir entidade."});
    }
  };

  const handleSyncMembers = async () => {
    if (!confirm("Isso vai adicionar todos os membros do workspace a todos os projetos. Continuar?")) return;
    setSyncing(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/projects/sync-members/`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Sincronizado",
        message: `${data.synced_projects} projetos e ${data.synced_members} membros sincronizados.`,
      });
    } catch {
      setToast({type: TOAST_TYPE.ERROR, title: "Erro", message: "Falha ao sincronizar membros."});
    } finally {
      setSyncing(false);
    }
  };

  if (!isAdmin)
    return (
      <NotAuthorizedView
        section="settings"
        className="h-auto"
      />
    );

  const filtered = entities.filter((e) => {
    if (filterType !== null && e.entity_type !== filterType) return false;
    if (search) {
      const s = search.toLowerCase();
      return e.name.toLowerCase().includes(s) || (e.city ?? "").toLowerCase().includes(s) || (e.cnpj ?? "").includes(s);
    }
    return true;
  });

  return (
    <SettingsContentWrapper
      header={
        <div className="flex h-full items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-secondary-text" />
            <h3 className="text-lg font-semibold">Entidades</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="lg"
              onClick={handleSyncMembers}
              loading={syncing}
            >
              Sincronizar Membros
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={() => setModal({open: true, entity: null})}
            >
              <Plus className="mr-1 h-4 w-4" /> Nova Entidade
            </Button>
          </div>
        </div>
      }
    >
      <PageHead title={`${currentWorkspace?.name ?? ""} - Entidades`} />

      <EntityModal
        entity={modal.entity}
        workspaceSlug={workspaceSlug}
        open={modal.open}
        onClose={() => setModal({open: false})}
        onSaved={load}
      />

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-md border border-subtle bg-surface-2 px-2.5 py-1.5 flex-1 min-w-[200px]">
            <Search className="h-3.5 w-3.5 text-secondary-text" />
            <input
              className="w-full border-none bg-transparent text-xs text-primary outline-none placeholder:text-secondary-text"
              placeholder="Buscar por nome, cidade ou CNPJ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <SelectPesquisavel
            value={filterType ?? ""}
            onChange={(valor) => setFilterType(valor !== "" ? Number(valor) : null)}
            opcoes={ENTITY_TYPES.map((t) => ({value: t.value, label: t.label}))}
            opcaoVazia={{value: "", label: "Todos os tipos"}}
            className="w-44"
            buttonClassName="h-8 text-xs"
          />
        </div>

        <p className="text-xs text-secondary-text">{filtered.length} entidade(s)</p>

        {loading ? (
          <div className="py-8 text-center text-secondary-text text-sm">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-secondary-text text-sm">
            {entities.length === 0
              ? 'Nenhuma entidade cadastrada. Clique em "Nova Entidade" para começar.'
              : "Nenhuma entidade encontrada com os filtros atuais."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-subtle">
            <table className="w-full text-xs">
              <thead className="bg-surface-2 text-secondary-text">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Nome</th>
                  <th className="px-4 py-2.5 text-left font-medium">Tipo</th>
                  <th className="px-4 py-2.5 text-left font-medium">Cidade/UF</th>
                  <th className="px-4 py-2.5 text-left font-medium">Contato</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {filtered.map((entity) => (
                  <tr
                    key={entity.id}
                    className="hover:bg-surface-2 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-medium text-primary">{entity.name}</td>
                    <td className="px-4 py-2.5 text-secondary-text">{entityTypeLabel(entity.entity_type) || "—"}</td>
                    <td className="px-4 py-2.5 text-secondary-text">{[entity.city, entity.state].filter(Boolean).join("/") || "—"}</td>
                    <td className="px-4 py-2.5 text-secondary-text">{entity.email || entity.phone || "—"}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          entity.is_active
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        }`}
                      >
                        {entity.is_active ? "Ativa" : "Inativa"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setModal({open: true, entity})}
                          className="rounded p-1 text-secondary-text hover:bg-surface-3 hover:text-primary transition-colors"
                          title="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(entity.id)}
                          className="rounded p-1 text-secondary-text hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SettingsContentWrapper>
  );
});

export default WorkspaceEntitiesPage;
