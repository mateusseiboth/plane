import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
import entityService, { type TEntity, entityTypeLabel } from "@/services/entity.service";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Building2, Pencil, Plus, Search, Snowflake, Sun, Trash2 } from "lucide-react";
import { observer } from "mobx-react";
import { useState } from "react";
import type { Route } from "./+types/page";
import { SelectPesquisavel } from "@/components/common/select-pesquisavel";
import { ENTITY_TYPES, EntityFormModal } from "@/components/entities/entity-form-modal";
import { FreezeDialog } from "@/components/freeze/freeze-dialog";
import { useAllEntities } from "@/hooks/use-entities";

type TStatusFilter = "all" | "active" | "inactive" | "frozen";

const STATUS_FILTERS: { value: TStatusFilter; label: string }[] = [
  { value: "all", label: "Todas as situações" },
  { value: "active", label: "Ativas" },
  { value: "inactive", label: "Inativas" },
  { value: "frozen", label: "Congeladas" },
];

const STATUS_MATCHERS: Record<TStatusFilter, (e: TEntity) => boolean> = {
  all: () => true,
  active: (e) => Boolean(e.is_active) && !e.is_frozen,
  inactive: (e) => !e.is_active,
  frozen: (e) => Boolean(e.is_frozen),
};

type TStatusBadge = { label: string; className: string };

const BADGE_FROZEN: TStatusBadge = {
  label: "Congelada",
  className: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
};
const BADGE_ACTIVE: TStatusBadge = {
  label: "Ativa",
  className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};
const BADGE_INACTIVE: TStatusBadge = {
  label: "Inativa",
  className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

function readStatusBadge(entity: TEntity): TStatusBadge {
  if (entity.is_frozen) return BADGE_FROZEN;
  return entity.is_active ? BADGE_ACTIVE : BADGE_INACTIVE;
}

function matchesSearch(entity: TEntity, search: string): boolean {
  if (!search) return true;
  const s = search.toLowerCase();
  return [entity.name, entity.city, entity.cnpj].some((value) => (value ?? "").toLowerCase().includes(s));
}

const WorkspaceEntitiesPage = observer(function WorkspaceEntitiesPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { allowPermissions } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();
  const { entities, isLoading, refetch } = useAllEntities(workspaceSlug);

  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<TStatusFilter>("all");
  const [modal, setModal] = useState<{ open: boolean; entity?: TEntity | null }>({ open: false });
  const [freezeTarget, setFreezeTarget] = useState<TEntity | null>(null);
  const [syncing, setSyncing] = useState(false);

  const handleDelete = async (entityId: string) => {
    if (!confirm("Confirmar exclusão desta entidade?")) return;
    try {
      await entityService.remove(workspaceSlug, entityId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Excluído", message: "Entidade removida." });
      await refetch();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "Não foi possível excluir a entidade." });
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
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "Falha ao sincronizar membros." });
    } finally {
      setSyncing(false);
    }
  };

  if (!isAdmin) return <NotAuthorizedView section="settings" className="h-auto" />;

  const filtered = entities.filter(
    (e) =>
      (filterType === null || e.entity_type === filterType) &&
      STATUS_MATCHERS[filterStatus](e) &&
      matchesSearch(e, search)
  );

  return (
    <SettingsContentWrapper
      header={
        <div className="flex h-full items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-secondary" />
            <h3 className="text-lg font-semibold">Entidades</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="lg" onClick={handleSyncMembers} loading={syncing}>
              Sincronizar Membros
            </Button>
            <Button variant="primary" size="lg" onClick={() => setModal({ open: true, entity: null })}>
              <Plus className="mr-1 h-4 w-4" /> Nova Entidade
            </Button>
          </div>
        </div>
      }
    >
      <PageHead title={`${currentWorkspace?.name ?? ""} - Entidades`} />

      <EntityFormModal
        entity={modal.entity}
        entities={entities}
        workspaceSlug={workspaceSlug}
        open={modal.open}
        onClose={() => setModal({ open: false })}
        onSaved={() => refetch()}
      />

      {freezeTarget && (
        <FreezeDialog
          open
          onClose={() => setFreezeTarget(null)}
          workspaceSlug={workspaceSlug}
          subject="entity"
          id={freezeTarget.id}
          name={freezeTarget.name}
          isFrozen={Boolean(freezeTarget.is_frozen)}
          onDone={() => refetch()}
        />
      )}

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-[200px] flex-1 items-center gap-1.5 rounded-md border border-subtle bg-surface-2 px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 text-secondary" />
            <input
              className="text-xs w-full border-none bg-transparent text-primary outline-none placeholder:text-secondary"
              placeholder="Buscar por nome, cidade ou CNPJ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <SelectPesquisavel
            value={filterType ?? ""}
            onChange={(valor) => setFilterType(valor !== "" ? Number(valor) : null)}
            opcoes={ENTITY_TYPES}
            opcaoVazia={{ value: "", label: "Todos os tipos" }}
            className="w-44"
            buttonClassName="h-8 text-xs"
          />
          <SelectPesquisavel
            value={filterStatus}
            onChange={(valor) => setFilterStatus(valor)}
            opcoes={STATUS_FILTERS}
            className="w-44"
            buttonClassName="h-8 text-xs"
          />
        </div>

        <p className="text-xs text-secondary">{filtered.length} entidade(s)</p>

        {isLoading ? (
          <div className="text-sm py-8 text-center text-secondary">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm py-8 text-center text-secondary">
            {entities.length === 0
              ? 'Nenhuma entidade cadastrada. Clique em "Nova Entidade" para começar.'
              : "Nenhuma entidade encontrada com os filtros atuais."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-subtle">
            <table className="text-xs w-full">
              <thead className="bg-surface-2 text-secondary">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Nome</th>
                  <th className="px-4 py-2.5 text-left font-medium">Tipo</th>
                  <th className="px-4 py-2.5 text-left font-medium">Cidade/UF</th>
                  <th className="px-4 py-2.5 text-left font-medium">Contato</th>
                  <th className="px-4 py-2.5 text-left font-medium">Situação</th>
                  <th className="px-4 py-2.5 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {filtered.map((entity) => {
                  const badge = readStatusBadge(entity);
                  const FreezeIcon = entity.is_frozen ? Sun : Snowflake;
                  return (
                    <tr key={entity.id} className="transition-colors hover:bg-surface-2">
                      <td className="px-4 py-2.5 font-medium text-primary">{entity.name}</td>
                      <td className="px-4 py-2.5 text-secondary">{entityTypeLabel(entity.entity_type) || "—"}</td>
                      <td className="px-4 py-2.5 text-secondary">
                        {[entity.city, entity.state].filter(Boolean).join("/") || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-secondary">{entity.email || entity.phone || "—"}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`text-xs inline-flex rounded-full px-2 py-0.5 font-medium ${badge.className}`}
                          title={entity.frozen_reason ?? undefined}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setModal({ open: true, entity })}
                            className="hover:bg-surface-3 rounded p-1 text-secondary transition-colors hover:text-primary"
                            title="Editar"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setFreezeTarget(entity)}
                            className="hover:bg-surface-3 rounded p-1 text-secondary transition-colors hover:text-primary"
                            title={entity.is_frozen ? "Descongelar" : "Congelar"}
                          >
                            <FreezeIcon className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(entity.id)}
                            className="hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 rounded p-1 text-secondary transition-colors"
                            title="Excluir"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SettingsContentWrapper>
  );
});

export default WorkspaceEntitiesPage;
