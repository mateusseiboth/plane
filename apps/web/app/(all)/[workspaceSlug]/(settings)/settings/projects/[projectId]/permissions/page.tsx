/**
 * Permissões do projeto.
 *
 * Esta tela **gerencia o papel dos membros** e exibe, em modo somente-leitura, a
 * configuração real de funções do workspace (`GET /roles/`) — as mesmas linhas
 * que o backend aplica em `resolveRole` / `canTransition`. Nada aqui é derivado
 * de matriz estática: para editar capacidades ou transições use a tela
 * "Funções e permissões" do workspace, que grava exatamente esses registros.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  Crown,
  Eye,
  Loader2,
  Minus,
  Shield,
  ShieldAlert,
  ShieldCheck,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import { EProjectAction, EUserPermissions, EUserPermissionsLevel, PROJECT_ACTION_LABELS } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { Dialog, EDialogWidth } from "@plane/propel/dialog";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EUserProjectRoles, type TProjectMembership } from "@plane/types";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { describeTransitionSide } from "@/constants/workflow-roles";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { useWorkspaceWorkflowRoles } from "@/hooks/use-workflow-role";
import projectMemberService from "@/services/project/project-member.service";
import type { TRoleTransition, TWorkflowRole } from "@/services/roles.service";
import type { Route } from "./+types/page";

type TRoleStyle = {
  icon: LucideIcon;
  color: string;
  bg: string;
};

/** Decoração por nível de papel. Sem regra de negócio: capacidades vêm da API. */
const ROLE_STYLES: Record<number, TRoleStyle> = {
  [EUserProjectRoles.GUEST]: {
    icon: Eye,
    color: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-800",
  },
  [EUserProjectRoles.ATENDIMENTO]: {
    icon: User,
    color: "text-sky-600 dark:text-sky-400",
    bg: "bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800",
  },
  [EUserProjectRoles.QUALIDADE]: {
    icon: ShieldAlert,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800",
  },
  [EUserProjectRoles.TI]: {
    icon: ShieldCheck,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800",
  },
  [EUserProjectRoles.MEMBER]: {
    icon: Users,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
  },
  [EUserProjectRoles.GESTOR_PROJETO]: {
    icon: ShieldCheck,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800",
  },
  [EUserProjectRoles.ADMIN]: {
    icon: Crown,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800",
  },
};

const DEFAULT_ROLE_STYLE: TRoleStyle = {
  icon: Shield,
  color: "text-secondary-text",
  bg: "border-subtle bg-surface-2",
};

const styleForLevel = (level: number): TRoleStyle => ROLE_STYLES[level] ?? DEFAULT_ROLE_STYLE;

const CAPABILITY_ROWS = (Object.values(EProjectAction) as EProjectAction[]).map((action) => ({
  action,
  label: PROJECT_ACTION_LABELS[action] ?? action,
}));

type TTransitionRow = {
  key: string;
  label: string;
  roleIds: Set<string>;
};

const transitionKey = (t: TRoleTransition) =>
  `${t.from_group}:${t.from_state_name ?? "*"}>${t.to_group}:${t.to_state_name ?? "*"}`;

/** Linhas de transição = união do que está configurado em `role.transitions`. */
const buildTransitionRows = (roles: TWorkflowRole[]): TTransitionRow[] => {
  const rows = new Map<string, TTransitionRow>();

  roles.forEach((role) =>
    role.transitions
      .filter((t) => t.allowed)
      .forEach((t) => {
        const key = transitionKey(t);
        const row = rows.get(key) ?? {
          key,
          label: `${describeTransitionSide(t.from_group, t.from_state_name)} → ${describeTransitionSide(t.to_group, t.to_state_name)}`,
          roleIds: new Set<string>(),
        };
        row.roleIds.add(role.id);
        rows.set(key, row);
      })
  );

  const ordered = [...rows.values()];
  ordered.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  return ordered;
};

type TProjectMemberRow = TProjectMembership & {
  member__display_name?: string;
  member__avatar_url?: string;
};

const MatrixCell = ({ allowed }: { allowed: boolean }) =>
  allowed ? (
    <CheckCircle className="mx-auto h-3.5 w-3.5 text-green-500" />
  ) : (
    <Minus className="mx-auto h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
  );

const ProjectPermissionsPage = observer(function ProjectPermissionsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const { allowPermissions } = useUserPermissions();
  const { currentProjectDetails } = useProject();
  const { getUserDetails } = useMember();
  const { roles, isLoading: isRolesLoading } = useWorkspaceWorkflowRoles(workspaceSlug);

  const [members, setMembers] = useState<TProjectMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [roleDialogMember, setRoleDialogMember] = useState<TProjectMemberRow | null>(null);

  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT, workspaceSlug, projectId);
  const isWorkspaceAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  const configuredRoles = useMemo(() => roles ?? [], [roles]);
  const transitionRows = useMemo(() => buildTransitionRows(configuredRoles), [configuredRoles]);
  const roleByLevel = useMemo(
    () => new Map(configuredRoles.map((role) => [role.level, role])),
    [configuredRoles]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await projectMemberService.fetchProjectMembers(workspaceSlug, projectId);
      setMembers(Array.isArray(data) ? (data as TProjectMemberRow[]) : []);
    } catch {
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug, projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRoleChange = async (memberId: string, newRole: number) => {
    setSaving(memberId);
    try {
      await projectMemberService.updateProjectMember(workspaceSlug, projectId, memberId, {
        role: newRole as EUserProjectRoles,
      });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Salvo", message: "Permissão atualizada." });
      await load();
      setRoleDialogMember(null);
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Erro",
        message: (error as { detail?: string })?.detail ?? "Falha ao atualizar permissão.",
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

  const displayNameOf = (member: TProjectMemberRow) =>
    member.member__display_name ?? getUserDetails(member.member)?.display_name ?? "Desconhecido";

  const avatarOf = (member: TProjectMemberRow) =>
    member.member__avatar_url ?? getUserDetails(member.member)?.avatar_url ?? undefined;

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
          <div className="max-h-[85vh] overflow-y-auto p-6">
            <div className="mb-5">
              <Dialog.Title>Alterar papel de {roleDialogMember ? displayNameOf(roleDialogMember) : ""}</Dialog.Title>
              <p className="mt-1 text-sm text-secondary-text">
                Selecione a função deste membro. As capacidades de cada função são as configuradas no workspace.
              </p>
            </div>

            {configuredRoles.length === 0 ? (
              <p className="py-6 text-center text-sm text-secondary-text">
                {isRolesLoading ? "Carregando funções..." : "Nenhuma função configurada neste workspace."}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {configuredRoles.map((role) => {
                  const style = styleForLevel(role.level);
                  const Icon = style.icon;
                  const isCurrent = roleDialogMember?.role === role.level;
                  const allowedTransitions = role.transitions.filter((t) => t.allowed).length;

                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => roleDialogMember && handleRoleChange(roleDialogMember.member, role.level)}
                      disabled={isCurrent || saving === roleDialogMember?.member}
                      className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-all ${style.bg} ${isCurrent ? "ring-2 ring-accent-primary" : "hover:shadow-sm"} disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      <div className="flex w-full items-center gap-2">
                        <Icon className={`h-4 w-4 ${style.color}`} />
                        <span className={`text-sm font-semibold ${style.color}`}>{role.name}</span>
                        {isCurrent && <CheckCircle className="ml-auto h-3.5 w-3.5 text-accent-primary" />}
                      </div>
                      <p className="text-xs text-secondary-text">
                        {role.permissions.length} permissão(ões) · {allowedTransitions} transição(ões) de etapa
                      </p>
                      <ul className="mt-1 space-y-1">
                        {role.permissions.slice(0, 3).map((permission) => (
                          <li
                            key={permission}
                            className="flex items-center gap-1.5 text-xs text-secondary-text"
                          >
                            <div className="h-1 w-1 shrink-0 rounded-full bg-secondary-text" />
                            {PROJECT_ACTION_LABELS[permission as EProjectAction] ?? permission}
                          </li>
                        ))}
                        {role.permissions.length > 3 && (
                          <li className="text-xs text-secondary-text">
                            e mais {role.permissions.length - 3} na matriz abaixo
                          </li>
                        )}
                      </ul>
                    </button>
                  );
                })}
              </div>
            )}

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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="flex items-center gap-2 text-sm font-medium">
              <Shield className="h-4 w-4 text-secondary-text" />
              Configuração de funções do workspace
            </h4>
            <p className="mt-1 text-xs text-secondary-text">
              Somente leitura. Quem participa do projeto enxerga todos os chamados, em qualquer etapa — o que varia por
              função é o que ela pode fazer e para quais etapas pode mover.
            </p>
          </div>
          <Link
            href={`/${workspaceSlug}/settings/roles/`}
            className="inline-flex items-center gap-1 text-xs font-medium text-accent-primary hover:underline"
          >
            Editar funções e permissões
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {isRolesLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-secondary-text" />
          </div>
        ) : configuredRoles.length === 0 ? (
          <p className="py-6 text-center text-sm text-secondary-text">Nenhuma função configurada neste workspace.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-secondary-text">
                  <th className="py-2 pr-4 text-left font-medium">Capacidade</th>
                  {configuredRoles.map((role) => (
                    <th
                      key={role.id}
                      className="px-3 py-2 text-center font-medium"
                    >
                      <span className={styleForLevel(role.level).color}>{role.name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {CAPABILITY_ROWS.map((row) => (
                  <tr
                    key={row.action}
                    className="transition-colors hover:bg-surface-3"
                  >
                    <td className="py-2 pr-4 text-secondary-text">{row.label}</td>
                    {configuredRoles.map((role) => (
                      <td
                        key={`${row.action}-${role.id}`}
                        className="px-3 py-2 text-center"
                      >
                        <MatrixCell allowed={role.permissions.includes(row.action)} />
                      </td>
                    ))}
                  </tr>
                ))}

                {transitionRows.length > 0 && (
                  <tr>
                    <td
                      className="pt-4 pb-2 pr-4 text-11 font-medium tracking-wide text-secondary-text uppercase"
                      colSpan={configuredRoles.length + 1}
                    >
                      Transições de etapa permitidas
                    </td>
                  </tr>
                )}
                {transitionRows.map((row) => (
                  <tr
                    key={row.key}
                    className="transition-colors hover:bg-surface-3"
                  >
                    <td className="py-2 pr-4 text-secondary-text">{row.label}</td>
                    {configuredRoles.map((role) => (
                      <td
                        key={`${row.key}-${role.id}`}
                        className="px-3 py-2 text-center"
                      >
                        <MatrixCell
                          allowed={
                            row.roleIds.has(role.id) ||
                            role.permissions.includes(EProjectAction.STATE_MOVE_UNRESTRICTED)
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
                  const style = styleForLevel(member.role);
                  const Icon = style.icon;
                  const displayName = displayNameOf(member);
                  const avatarUrl = avatarOf(member);
                  const email = getUserDetails(member.member)?.email;

                  return (
                    <tr
                      key={member.member}
                      className="transition-colors hover:bg-surface-2"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {avatarUrl ? (
                            <img
                              src={avatarUrl}
                              alt={displayName}
                              className="h-8 w-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-3 text-xs font-medium">
                              {displayName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-primary">{displayName}</p>
                            {email && <p className="text-xs text-secondary-text">{email}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${style.bg}`}
                        >
                          <Icon className={`h-3 w-3 ${style.color}`} />
                          <span className={style.color}>{roleByLevel.get(member.role)?.name ?? "Desconhecido"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          {saving === member.member ? (
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
