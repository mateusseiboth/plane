import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Shield, ShieldCheck, ShieldAlert, User, Crown, Eye, Users, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@plane/propel/button";
import { Dialog, EDialogWidth } from "@plane/propel/dialog";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import type { Route } from "./+types/page";

// ── Role definitions ───────────────────────────────────────────────────────────

const ROLES = [
  {
    value: 20,
    label: "Admin",
    icon: Crown,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800",
    description: "Acesso total ao projeto. Pode gerenciar membros, configurações e todos os trabalhos.",
    permissions: [
      "Gerenciar membros e papéis",
      "Alterar configurações do projeto",
      "Criar e deletar estados/labels",
      "Criar, editar e deletar todos os work items",
      "Fechar e arquivar issues",
      "Gerenciar módulos e ciclos",
    ],
  },
  {
    value: 15,
    label: "Membro",
    icon: Users,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
    description: "Pode criar e editar work items, comentar e colaborar plenamente no projeto.",
    permissions: [
      "Criar e editar work items",
      "Comentar e reagir a issues",
      "Criar módulos e ciclos",
      "Gerenciar labels próprias",
      "Visualizar todas as configurações",
    ],
  },
  {
    value: 10,
    label: "Visualizador",
    icon: Eye,
    color: "text-green-600 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800",
    description: "Pode visualizar e comentar, mas não pode criar ou editar work items.",
    permissions: [
      "Visualizar todos os work items",
      "Adicionar comentários",
      "Visualizar módulos e ciclos",
    ],
  },
  {
    value: 5,
    label: "Convidado",
    icon: User,
    color: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-800",
    description: "Acesso apenas de leitura. Não pode interagir com o conteúdo.",
    permissions: [
      "Somente visualização de issues",
      "Sem permissão de escrita",
    ],
  },
];

const ROLE_LABELS: Record<number, string> = { 20: "Admin", 15: "Membro", 10: "Visualizador", 5: "Convidado" };
const ROLE_ICONS: Record<number, typeof Crown> = { 20: Crown, 15: Users, 10: Eye, 5: User };

type TMember = {
  id: string;
  member_id: string;
  display_name: string;
  avatar?: string;
  avatar_url?: string;
  email?: string;
  role: number;
};

// ── Permissions page ───────────────────────────────────────────────────────────

const ProjectPermissionsPage = observer(function ProjectPermissionsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const { allowPermissions } = useUserPermissions();
  const { currentProjectDetails } = useProject();

  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT, workspaceSlug, projectId);
  const isWorkspaceAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  const [members, setMembers] = useState<TMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [roleDialogMember, setRoleDialogMember] = useState<TMember | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/members/`, { credentials: "include" });
      const data = await res.json();
      const memberRes = await fetch(`/api/workspaces/${workspaceSlug}/members/`, { credentials: "include" });
      const workspaceMembers = await memberRes.json();
      const wsMap: Record<string, { display_name: string; avatar?: string; avatar_url?: string; email?: string }> = {};
      (Array.isArray(workspaceMembers) ? workspaceMembers : []).forEach((m: any) => {
        wsMap[m.member?.id ?? m.member] = {
          display_name: m.member?.display_name ?? m.member__display_name ?? "Desconhecido",
          avatar: m.member?.avatar ?? m.member__avatar,
          avatar_url: m.member?.avatar_url ?? m.member__avatar_url,
          email: m.member?.email,
        };
      });
      setMembers(
        (Array.isArray(data) ? data : []).map((m: any) => ({
          id: m.id,
          member_id: m.member,
          display_name: wsMap[m.member]?.display_name ?? m.member__display_name ?? "Desconhecido",
          avatar: wsMap[m.member]?.avatar ?? m.member__avatar,
          avatar_url: wsMap[m.member]?.avatar_url ?? m.member__avatar_url,
          email: wsMap[m.member]?.email,
          role: m.role,
        }))
      );
    } catch {
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug, projectId]);

  useEffect(() => { load(); }, [load]);

  const handleRoleChange = async (memberId: string, membershipId: string, newRole: number) => {
    setSaving(membershipId);
    try {
      await fetch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/members/${membershipId}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role: newRole }),
      });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Salvo", message: "Permissão atualizada." });
      load();
      setRoleDialogMember(null);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "Falha ao atualizar permissão." });
    } finally {
      setSaving(null);
    }
  };

  if (!isAdmin && !isWorkspaceAdmin) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  const pageTitle = currentProjectDetails?.name ? `${currentProjectDetails.name} - Permissões` : "Permissões";

  return (
    <SettingsContentWrapper
      header={
        <div className="flex h-full items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-secondary-text" />
          <h3 className="text-lg font-semibold">Gerenciamento de Permissões</h3>
        </div>
      }
    >
      <PageHead title={pageTitle} />

      {/* Role Dialog */}
      <Dialog open={!!roleDialogMember} onOpenChange={(v) => { if (!v) setRoleDialogMember(null); }}>
        <Dialog.Panel width={EDialogWidth.LG}>
          <div className="p-6">
            <div className="mb-5">
              <Dialog.Title>Alterar papel de {roleDialogMember?.display_name}</Dialog.Title>
              <p className="mt-1 text-sm text-secondary-text">Selecione o nível de acesso para este membro.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {ROLES.map((role) => {
                const Icon = role.icon;
                const isCurrent = roleDialogMember?.role === role.value;
                return (
                  <button
                    key={role.value}
                    type="button"
                    onClick={() => roleDialogMember && handleRoleChange(roleDialogMember.member_id, roleDialogMember.id, role.value)}
                    disabled={isCurrent || saving === roleDialogMember?.id}
                    className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-all ${role.bg} ${isCurrent ? "ring-2 ring-accent-primary" : "hover:shadow-sm"} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${role.color}`} />
                      <span className={`text-sm font-semibold ${role.color}`}>{role.label}</span>
                      {isCurrent && <CheckCircle className="h-3.5 w-3.5 text-accent-primary ml-auto" />}
                    </div>
                    <p className="text-xs text-secondary-text">{role.description}</p>
                    <ul className="mt-1 space-y-1">
                      {role.permissions.map((p) => (
                        <li key={p} className="flex items-center gap-1.5 text-xs text-secondary-text">
                          <div className="h-1 w-1 rounded-full bg-secondary-text shrink-0" />
                          {p}
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="neutral-secondary" size="sm" onClick={() => setRoleDialogMember(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        </Dialog.Panel>
      </Dialog>

      {/* Role matrix reference */}
      <div className="mb-6 rounded-lg border border-subtle bg-surface-2 p-4">
        <h4 className="mb-3 text-sm font-medium flex items-center gap-2">
          <Shield className="h-4 w-4 text-secondary-text" />
          Matriz de Permissões
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-secondary-text">
                <th className="py-2 pr-4 text-left font-medium">Ação</th>
                {ROLES.map((r) => (
                  <th key={r.value} className="px-3 py-2 text-center font-medium">
                    <span className={r.color}>{r.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {[
                { action: "Visualizar issues", min: 5 },
                { action: "Criar/editar issues", min: 15 },
                { action: "Deletar issues", min: 20 },
                { action: "Comentar", min: 10 },
                { action: "Gerenciar estados/labels", min: 15 },
                { action: "Gerenciar membros", min: 20 },
                { action: "Configurações do projeto", min: 20 },
              ].map(({ action, min }) => (
                <tr key={action} className="hover:bg-surface-3 transition-colors">
                  <td className="py-2 pr-4 text-secondary-text">{action}</td>
                  {ROLES.map((r) => (
                    <td key={r.value} className="px-3 py-2 text-center">
                      {r.value >= min ? (
                        <CheckCircle className="h-3.5 w-3.5 text-green-500 mx-auto" />
                      ) : (
                        <ShieldAlert className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 mx-auto" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Member list */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">{members.length} Membro(s)</h4>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-secondary-text" />
          </div>
        ) : members.length === 0 ? (
          <div className="py-8 text-center text-sm text-secondary-text">Nenhum membro encontrado.</div>
        ) : (
          <div className="rounded-lg border border-subtle overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-2">
                <tr className="text-secondary-text text-xs">
                  <th className="px-4 py-2.5 text-left font-medium">Membro</th>
                  <th className="px-4 py-2.5 text-left font-medium">Papel atual</th>
                  <th className="px-4 py-2.5 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {members.map((m) => {
                  const Icon = ROLE_ICONS[m.role] ?? User;
                  const roleInfo = ROLES.find((r) => r.value === m.role);
                  return (
                    <tr key={m.id} className="hover:bg-surface-2 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {m.avatar_url || m.avatar ? (
                            <img src={m.avatar_url ?? m.avatar} alt={m.display_name} className="h-8 w-8 rounded-full object-cover" />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-3 text-xs font-medium">
                              {m.display_name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-primary">{m.display_name}</p>
                            {m.email && <p className="text-xs text-secondary-text">{m.email}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${roleInfo?.bg ?? ""}`}>
                          <Icon className={`h-3 w-3 ${roleInfo?.color ?? ""}`} />
                          <span className={roleInfo?.color ?? ""}>{ROLE_LABELS[m.role] ?? "Desconhecido"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          {saving === m.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-secondary-text" />
                          ) : (
                            <Button
                              variant="neutral-secondary"
                              size="sm"
                              onClick={() => setRoleDialogMember(m)}
                              disabled={!isAdmin && !isWorkspaceAdmin}
                            >
                              Alterar papel
                            </Button>
                          )}
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

export default ProjectPermissionsPage;
