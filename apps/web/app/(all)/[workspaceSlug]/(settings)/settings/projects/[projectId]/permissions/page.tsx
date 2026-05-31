import {NotAuthorizedView} from "@/components/auth-screens/not-authorized-view";
import {PageHead} from "@/components/core/page-title";
import {SettingsContentWrapper} from "@/components/settings/content-wrapper";
import {useProject} from "@/hooks/store/use-project";
import {useUserPermissions} from "@/hooks/store/user";
import {EProjectAction, EUserPermissions, EUserPermissionsLevel, ROLE_PERMISSIONS} from "@plane/constants";
import {Button} from "@plane/propel/button";
import {Dialog, EDialogWidth} from "@plane/propel/dialog";
import {TOAST_TYPE, setToast} from "@plane/propel/toast";
import {EUserProjectRoles} from "@plane/types";
import {CheckCircle, Crown, Eye, Loader2, Shield, ShieldAlert, ShieldCheck, User, Users, type LucideIcon} from "lucide-react";
import {observer} from "mobx-react";
import {useCallback, useEffect, useState} from "react";
import type {Route} from "./+types/page";

type TRoleOption = {
  value: EUserProjectRoles;
  label: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  description: string;
  highlights: string[];
};

type TPermissionRow = {
  label: string;
  action: EProjectAction;
};

type TMember = {
  id: string;
  member_id: string;
  display_name: string;
  avatar?: string;
  avatar_url?: string;
  email?: string;
  role: number;
};

const ROLE_OPTIONS: TRoleOption[] = [
  {
    value: EUserProjectRoles.GUEST,
    label: "Convidado",
    icon: Eye,
    color: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-800",
    description: "Acesso apenas de leitura para acompanhar o andamento do projeto.",
    highlights: ["Visualiza work items, comentários e anexos", "Não executa ações de escrita"],
  },
  {
    value: EUserProjectRoles.ATENDIMENTO,
    label: "Atendimento",
    icon: User,
    color: "text-sky-600 dark:text-sky-400",
    bg: "bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800",
    description: "Perfil de entrada de chamados, com foco em abertura e acompanhamento inicial.",
    highlights: ["Cria chamados", "Comenta e anexa arquivos próprios", "Permanece restrito ao fluxo de entrada"],
  },
  {
    value: EUserProjectRoles.QUALIDADE,
    label: "Qualidade",
    icon: ShieldAlert,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800",
    description: "Responsável por revisar triagem, aprovar retorno e sinalizar problemas no fluxo.",
    highlights: ["Revisa chamados", "Devolve work items com erro", "Cria views de apoio"],
  },
  {
    value: EUserProjectRoles.MEMBER,
    label: "Membro",
    icon: Users,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
    description: "Perfil operacional para colaborar no ciclo completo do projeto.",
    highlights: ["Cria e edita work items", "Gerencia ciclos, módulos e labels", "Participa do fluxo completo"],
  },
  {
    value: EUserProjectRoles.TI,
    label: "T",
    icon: ShieldCheck,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800",
    description: "Execução técnica do trabalho, com foco em andamento, teste e conclusão.",
    highlights: ["Move work items entre execução e teste", "Gerencia ciclos e módulos", "Não administra membros"],
  },
  {
    value: EUserProjectRoles.GESTOR_PROJETO,
    label: "Gestão de Projetos",
    icon: ShieldCheck,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800",
    description: "Controle amplo do projeto, incluindo pessoas, estados e configurações.",
    highlights: ["Gerencia membros", "Controla estados e configurações", "Tem acesso amplo ao fluxo"],
  },
  {
    value: EUserProjectRoles.ADMIN,
    label: "Admin",
    icon: Crown,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800",
    description: "Acesso total ao projeto e às suas definições.",
    highlights: ["Acesso total", "Gerencia membros e configurações", "Pode executar qualquer ação"],
  },
];

const PERMISSION_ROWS: TPermissionRow[] = [
  {label: "Visualizar work items", action: EProjectAction.ISSUE_VIEW},
  {label: "Visualizar comentários", action: EProjectAction.COMMENT_READ},
  {label: "Visualizar anexos", action: EProjectAction.ATTACHMENT_VIEW},
  {label: "Criar work items", action: EProjectAction.ISSUE_CREATE},
  {label: "Editar work items próprios", action: EProjectAction.ISSUE_EDIT_OWN},
  {label: "Editar qualquer work item", action: EProjectAction.ISSUE_EDIT_ALL},
  {label: "Excluir work items próprios", action: EProjectAction.ISSUE_DELETE_OWN},
  {label: "Excluir qualquer work item", action: EProjectAction.ISSUE_DELETE_ALL},
  {label: "Atribuir a si mesmo", action: EProjectAction.ISSUE_ASSIGN_SELF},
  {label: "Atribuir outras pessoas", action: EProjectAction.ISSUE_ASSIGN_OTHERS},
  {label: "Criar comentários", action: EProjectAction.COMMENT_CREATE},
  {label: "Editar comentários próprios", action: EProjectAction.COMMENT_EDIT_OWN},
  {label: "Excluir comentários próprios", action: EProjectAction.COMMENT_DELETE_OWN},
  {label: "Excluir comentários de qualquer pessoa", action: EProjectAction.COMMENT_DELETE_ALL},
  {label: "Subir anexos", action: EProjectAction.ATTACHMENT_UPLOAD},
  {label: "Excluir anexos próprios", action: EProjectAction.ATTACHMENT_DELETE_OWN},
  {label: "Excluir anexos de qualquer pessoa", action: EProjectAction.ATTACHMENT_DELETE_ALL},
  {label: "Abrir chamados", action: EProjectAction.INTAKE_CREATE},
  {label: "Revisar chamados", action: EProjectAction.INTAKE_REVIEW},
  {label: "Triagem → Avaliando", action: EProjectAction.STATE_TRIAGE_TO_REVIEWING},
  {label: "Avaliando → A Fazer", action: EProjectAction.STATE_REVIEWING_TO_TODO},
  {label: "A Fazer → Em Andamento", action: EProjectAction.STATE_TODO_TO_IN_PROGRESS},
  {label: "Em Andamento → Em Teste", action: EProjectAction.STATE_IN_PROGRESS_TO_IN_TEST},
  {label: "Em Teste → Concluído", action: EProjectAction.STATE_IN_TEST_TO_DONE},
  {label: "Em Teste → Em Andamento", action: EProjectAction.STATE_IN_TEST_TO_IN_PROGRESS},
  {label: "Cancelar qualquer estado", action: EProjectAction.STATE_ANY_TO_CANCELLED},
  {label: "Movimento irrestrito", action: EProjectAction.STATE_MOVE_UNRESTRICTED},
  {label: "Gerenciar ciclos", action: EProjectAction.CYCLE_MANAGE},
  {label: "Gerenciar módulos", action: EProjectAction.MODULE_MANAGE},
  {label: "Gerenciar labels", action: EProjectAction.LABEL_MANAGE},
  {label: "Criar views", action: EProjectAction.VIEW_CREATE},
  {label: "Criar páginas", action: EProjectAction.PAGE_CREATE},
  {label: "Gerenciar membros", action: EProjectAction.MEMBER_MANAGE},
  {label: "Gerenciar estados", action: EProjectAction.STATE_MANAGE},
  {label: "Configurações do projeto", action: EProjectAction.PROJECT_SETTINGS},
];

const ROLE_LABELS: Record<number, string> = Object.fromEntries(ROLE_OPTIONS.map((role) => [role.value, role.label]));
const ROLE_ICONS: Record<number, LucideIcon> = Object.fromEntries(ROLE_OPTIONS.map((role) => [role.value, role.icon]));

const canRolePerform = (role: number, action: EProjectAction): boolean =>
  (ROLE_PERMISSIONS[role as EUserProjectRoles] ?? []).includes(action);

const ProjectPermissionsPage = observer(function ProjectPermissionsPage({params}: Route.ComponentProps) {
  const {workspaceSlug, projectId} = params;
  const {allowPermissions} = useUserPermissions();
  const {currentProjectDetails} = useProject();

  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT, workspaceSlug, projectId);
  const isWorkspaceAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  const [members, setMembers] = useState<TMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [roleDialogMember, setRoleDialogMember] = useState<TMember | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/members/`, {credentials: "include"});
      const data = await res.json();
      const memberRes = await fetch(`/api/workspaces/${workspaceSlug}/members/`, {credentials: "include"});
      const workspaceMembers = await memberRes.json();
      const wsMap: Record<string, {display_name: string; avatar?: string; avatar_url?: string; email?: string}> = {};

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
        })),
      );
    } catch {
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug, projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRoleChange = async (_memberId: string, membershipId: string, newRole: number) => {
    setSaving(membershipId);
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/members/${membershipId}/`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        credentials: "include",
        body: JSON.stringify({role: newRole}),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? "Falha ao atualizar permissão.");
      }

      setToast({type: TOAST_TYPE.SUCCESS, title: "Salvo", message: "Permissão atualizada."});
      await load();
      setRoleDialogMember(null);
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Erro",
        message: error instanceof Error ? error.message : "Falha ao atualizar permissão.",
      });
    } finally {
      setSaving(null);
    }
  };

  if (!isAdmin && !isWorkspaceAdmin) {
    return (
      <NotAuthorizedView
        section="settings"
        isProjectView
        className="h-auto"
      />
    );
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

      <Dialog
        open={!!roleDialogMember}
        onOpenChange={(v) => {
          if (!v) setRoleDialogMember(null);
        }}
      >
        <Dialog.Panel width={EDialogWidth.LG}>
          <div className="p-6">
            <div className="mb-5">
              <Dialog.Title>Alterar papel de {roleDialogMember?.display_name}</Dialog.Title>
              <p className="mt-1 text-sm text-secondary-text">Selecione o nível de acesso para este membro.</p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {ROLE_OPTIONS.map((role) => {
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
                    <div className="flex w-full items-center gap-2">
                      <Icon className={`h-4 w-4 ${role.color}`} />
                      <span className={`text-sm font-semibold ${role.color}`}>{role.label}</span>
                      {isCurrent && <CheckCircle className="ml-auto h-3.5 w-3.5 text-accent-primary" />}
                    </div>
                    <p className="text-xs text-secondary-text">{role.description}</p>
                    <ul className="mt-1 space-y-1">
                      {role.highlights.map((highlight) => (
                        <li
                          key={highlight}
                          className="flex items-center gap-1.5 text-xs text-secondary-text"
                        >
                          <div className="h-1 w-1 shrink-0 rounded-full bg-secondary-text" />
                          {highlight}
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setRoleDialogMember(null)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </Dialog.Panel>
      </Dialog>

      <div className="mb-6 rounded-lg border border-subtle bg-surface-2 p-4">
        <h4 className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Shield className="h-4 w-4 text-secondary-text" />
          Matriz de permissões do projeto
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-secondary-text">
                <th className="py-2 pr-4 text-left font-medium">Ação</th>
                {ROLE_OPTIONS.map((role) => (
                  <th
                    key={role.value}
                    className="px-3 py-2 text-center font-medium"
                  >
                    <span className={role.color}>{role.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {PERMISSION_ROWS.map((row) => (
                <tr
                  key={row.action}
                  className="transition-colors hover:bg-surface-3"
                >
                  <td className="py-2 pr-4 text-secondary-text">{row.label}</td>
                  {ROLE_OPTIONS.map((role) => (
                    <td
                      key={`${row.action}-${role.value}`}
                      className="px-3 py-2 text-center"
                    >
                      {canRolePerform(role.value, row.action) ? (
                        <CheckCircle className="mx-auto h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <ShieldAlert className="mx-auto h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
          <div className="overflow-hidden rounded-lg border border-subtle">
            <table className="w-full text-sm">
              <thead className="bg-surface-2">
                <tr className="text-xs text-secondary-text">
                  <th className="px-4 py-2.5 text-left font-medium">Membro</th>
                  <th className="px-4 py-2.5 text-left font-medium">Papel atual</th>
                  <th className="px-4 py-2.5 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {members.map((member) => {
                  const Icon = ROLE_ICONS[member.role] ?? User;
                  const roleInfo = ROLE_OPTIONS.find((role) => role.value === member.role);

                  return (
                    <tr
                      key={member.id}
                      className="transition-colors hover:bg-surface-2"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {member.avatar_url || member.avatar ? (
                            <img
                              src={member.avatar_url ?? member.avatar}
                              alt={member.display_name}
                              className="h-8 w-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-3 text-xs font-medium">
                              {member.display_name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-primary">{member.display_name}</p>
                            {member.email && <p className="text-xs text-secondary-text">{member.email}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${roleInfo?.bg ?? ""}`}
                        >
                          <Icon className={`h-3 w-3 ${roleInfo?.color ?? ""}`} />
                          <span className={roleInfo?.color ?? ""}>{ROLE_LABELS[member.role] ?? "Desconhecido"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          {saving === member.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-secondary-text" />
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setRoleDialogMember(member)}
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
