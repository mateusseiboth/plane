/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Input } from "@plane/ui";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useAuditLogs } from "@/hooks/use-audit-logs";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// services
import { auditService, type TAuditFilters } from "@/services/audit.service";
// local imports
import { AuditoriaWorkspaceSettingsHeader } from "./header";

/** Rótulos em português para o vocabulário fechado da trilha. */
const ACTION_LABELS: Record<string, string> = {
  view: "Visualizou",
  list: "Listou",
  create: "Criou",
  update: "Alterou",
  delete: "Excluiu",
  print: "Imprimiu",
  export: "Exportou",
  download: "Baixou",
  comment: "Comentou",
  state_change: "Mudou o estado",
  assign: "Atribuiu",
  close: "Encerrou",
  reopen: "Reabriu",
  login: "Entrou no sistema",
  login_failed: "Falha de login",
  logout: "Saiu do sistema",
  permission_change: "Alterou permissão",
};

const ENTITY_LABELS: Record<string, string> = {
  issue: "Chamado",
  intake: "Solicitação",
  comment: "Comentário",
  attachment: "Anexo",
  project: "Projeto",
  workspace: "Espaço de trabalho",
  member: "Membro",
  user: "Usuário",
  entity: "Entidade",
  technical_visit: "Visita técnica",
  page: "Página",
  cycle: "Ciclo",
  module: "Módulo",
  report: "Relatório",
  chat_session: "Atendimento",
  audit_log: "Trilha de auditoria",
};

const PAGE_SIZE = 50;

function formatDateTime(value: string): string {
  const date = new Date(value);
  return isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
}

function summarizeChanges(changes: Record<string, unknown>): string {
  const entries = Object.entries(changes ?? {});
  if (entries.length === 0) return "—";
  return entries
    .map(([field, value]) => {
      const change = value as { de?: unknown; para?: unknown };
      if (change && typeof change === "object" && "para" in change) {
        return `${field}: ${String(change.de ?? "—")} → ${String(change.para ?? "—")}`;
      }
      return `${field}: ${String(value)}`;
    })
    .join("; ");
}

function AuditoriaSettingsPage() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();
  const { t } = useTranslation();

  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [actorEmail, setActorEmail] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);

  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  const filters: TAuditFilters = useMemo(
    () => ({
      action: action || undefined,
      entity: entity || undefined,
      date_from: dateFrom ? new Date(dateFrom).toISOString() : undefined,
      date_to: dateTo ? new Date(`${dateTo}T23:59:59`).toISOString() : undefined,
      cursor: `${PAGE_SIZE}:${page}:0`,
    }),
    [action, entity, dateFrom, dateTo, page]
  );

  const { logs, totalCount, hasNextPage, isLoading } = useAuditLogs(slug, filters, { enabled: isAdmin });

  // O filtro por e-mail é local: a trilha guarda o e-mail do ator, e filtrar no
  // cliente evita mais um índice no banco para um caso de uso pontual.
  const visibleLogs = useMemo(() => {
    const term = actorEmail.trim().toLowerCase();
    if (!term) return logs;
    return logs.filter((log) => (log.actor_email ?? "").toLowerCase().includes(term));
  }, [logs, actorEmail]);

  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - Auditoria` : undefined;

  if (workspaceUserInfo && !isAdmin) return <NotAuthorizedView section="settings" className="h-auto" />;

  const resetFilters = () => {
    setAction("");
    setEntity("");
    setActorEmail("");
    setDateFrom("");
    setDateTo("");
    setPage(0);
  };

  return (
    <SettingsContentWrapper header={<AuditoriaWorkspaceSettingsHeader />} hugging>
      <PageHead title={pageTitle} />
      <SettingsHeading
        title={t("workspace_settings.settings.auditoria.title")}
        description="Registro de quem acessou, alterou, imprimiu ou exportou dados neste espaço de trabalho. Exigido pela LGPD para comprovar o tratamento de dados pessoais."
      />

      <div className="flex flex-col gap-4 py-2">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-13 font-medium text-secondary" htmlFor="audit-action">
              Ação
            </label>
            <select
              id="audit-action"
              className="h-8 rounded-md border border-subtle bg-surface px-2 text-sm text-primary"
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(0);
              }}
            >
              <option value="">Todas</option>
              {Object.entries(ACTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-13 font-medium text-secondary" htmlFor="audit-entity">
              Tipo de registro
            </label>
            <select
              id="audit-entity"
              className="h-8 rounded-md border border-subtle bg-surface px-2 text-sm text-primary"
              value={entity}
              onChange={(e) => {
                setEntity(e.target.value);
                setPage(0);
              }}
            >
              <option value="">Todos</option>
              {Object.entries(ENTITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-13 font-medium text-secondary" htmlFor="audit-actor">
              E-mail do usuário
            </label>
            <Input
              id="audit-actor"
              type="text"
              value={actorEmail}
              onChange={(e) => setActorEmail(e.target.value)}
              placeholder="fulano@empresa.com"
              className="h-8 w-56"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-13 font-medium text-secondary" htmlFor="audit-from">
              De
            </label>
            <Input
              id="audit-from"
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(0);
              }}
              className="h-8 w-40"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-13 font-medium text-secondary" htmlFor="audit-to">
              Até
            </label>
            <Input
              id="audit-to"
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(0);
              }}
              className="h-8 w-40"
            />
          </div>

          <Button variant="neutral-primary" size="sm" onClick={resetFilters}>
            Limpar
          </Button>

          {slug && (
            <a href={auditService.exportUrl(slug, { ...filters, cursor: undefined })} download>
              <Button variant="primary" size="sm">
                Exportar CSV
              </Button>
            </a>
          )}
        </div>

        <p className="text-13 text-secondary">
          {isLoading ? "Carregando…" : `${totalCount} registro(s) encontrado(s).`}
        </p>

        <div className="overflow-x-auto rounded-md border border-subtle">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-surface-2 text-13 text-secondary">
              <tr>
                <th className="px-3 py-2 font-medium">Data e hora</th>
                <th className="px-3 py-2 font-medium">Usuário</th>
                <th className="px-3 py-2 font-medium">IP</th>
                <th className="px-3 py-2 font-medium">Ação</th>
                <th className="px-3 py-2 font-medium">Registro</th>
                <th className="px-3 py-2 font-medium">Alterações</th>
              </tr>
            </thead>
            <tbody>
              {visibleLogs.length === 0 && !isLoading && (
                <tr>
                  <td className="px-3 py-6 text-center text-secondary" colSpan={6}>
                    Nenhum registro para os filtros selecionados.
                  </td>
                </tr>
              )}
              {visibleLogs.map((log) => (
                <tr key={log.id} className="border-t border-subtle align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-secondary">{formatDateTime(log.created_at)}</td>
                  <td className="px-3 py-2 text-primary">{log.actor_email ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-secondary">{log.actor_ip ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-primary">{ACTION_LABELS[log.action] ?? log.action}</td>
                  <td className="px-3 py-2 text-secondary">
                    {ENTITY_LABELS[log.entity] ?? log.entity}
                    <span className="ml-1 text-13 text-tertiary">{log.entity_id.slice(0, 8)}</span>
                  </td>
                  <td className="px-3 py-2 text-13 text-secondary">{summarizeChanges(log.changes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="neutral-primary" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            Anterior
          </Button>
          <span className="text-13 text-secondary">Página {page + 1}</span>
          <Button variant="neutral-primary" size="sm" disabled={!hasNextPage} onClick={() => setPage((p) => p + 1)}>
            Próxima
          </Button>
        </div>
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(AuditoriaSettingsPage);
