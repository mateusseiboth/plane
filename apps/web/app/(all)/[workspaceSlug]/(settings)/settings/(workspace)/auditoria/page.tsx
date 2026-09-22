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
import { CustomSelect, Input } from "@plane/ui";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
import { AuditLogsPrintDocument, usePrint, type TLinhaDaAuditoria } from "@/components/print";
// hooks
import { useAuditLogs, useAuditLogsParaImpressao, useAuditRecorder } from "@/hooks/use-audit-logs";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// services
import { auditService, type TAuditFilters, type TAuditLog } from "@/services/audit.service";
// local imports
import { AuditoriaWorkspaceSettingsHeader } from "./header";

/**
 * Campo de seleção dos filtros da trilha.
 *
 * Usa o `CustomSelect` do design system em vez do `<select>` nativo: o nativo
 * não herda o tema, e no modo escuro o menu abria com fundo branco e texto
 * branco — praticamente ilegível.
 */
function FiltroSelect(props: {
  id: string;
  rotulo: string;
  valor: string;
  rotuloVazio: string;
  opcoes: Record<string, string>;
  onChange: (valor: string) => void;
}) {
  const { id, rotulo, valor, rotuloVazio, opcoes, onChange } = props;
  return (
    <div className="flex flex-col gap-1">
      <label className="text-13 font-medium text-secondary" htmlFor={id}>
        {rotulo}
      </label>
      <CustomSelect
        value={valor}
        onChange={onChange}
        label={<span className="truncate">{opcoes[valor] ?? rotuloVazio}</span>}
        buttonClassName="h-8 w-52 rounded-md border border-subtle bg-surface-1 px-2 text-13 text-primary"
        maxHeight="lg"
        input
      >
        <CustomSelect.Option value="">{rotuloVazio}</CustomSelect.Option>
        {Object.entries(opcoes).map(([value, label]) => (
          <CustomSelect.Option key={value} value={value}>
            {label}
          </CustomSelect.Option>
        ))}
      </CustomSelect>
    </div>
  );
}

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

const formatDia = (data: string) => data.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3/$2/$1");

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

// O filtro por e-mail é local: a trilha guarda o e-mail do ator, e filtrar no
// cliente evita mais um índice no banco para um caso de uso pontual.
function filterPorEmail(logs: TAuditLog[], email: string): TAuditLog[] {
  const term = email.trim().toLowerCase();
  if (!term) return logs;
  return logs.filter((log) => (log.actor_email ?? "").toLowerCase().includes(term));
}

function toLinhaDaAuditoria(log: TAuditLog): TLinhaDaAuditoria {
  return {
    id: log.id,
    quando: formatDateTime(log.created_at),
    usuario: log.actor_email ?? "—",
    ip: log.actor_ip ?? "—",
    acao: ACTION_LABELS[log.action] ?? log.action,
    registro: `${ENTITY_LABELS[log.entity] ?? log.entity} ${log.entity_id.slice(0, 8)}`,
    alteracoes: summarizeChanges(log.changes),
  };
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

  const visibleLogs = useMemo(() => filterPorEmail(logs, actorEmail), [logs, actorEmail]);

  // Impressão: busca de uma vez os registros dos filtros atuais (não só a página
  // na tela) e imprime. Imprimir a trilha também vai para a própria trilha.
  const [linhasDaImpressao, setLinhasDaImpressao] = useState<TLinhaDaAuditoria[]>([]);
  const [imprimindo, setImprimindo] = useState(false);
  const loadParaImpressao = useAuditLogsParaImpressao(slug);
  const recordAudit = useAuditRecorder(slug);
  const { print } = usePrint();
  const tituloDaImpressao = actorEmail.trim() ? `Auditoria de ${actorEmail.trim()}` : "Auditoria";

  const imprimir = async () => {
    setImprimindo(true);
    const registros = filterPorEmail(await loadParaImpressao({ ...filters, cursor: undefined }), actorEmail);
    setLinhasDaImpressao(registros.map(toLinhaDaAuditoria));
    setImprimindo(false);
    if (currentWorkspace?.id) {
      recordAudit("print", "audit_log", currentWorkspace.id, {
        usuario: actorEmail.trim() || null,
        total: registros.length,
      });
    }
    window.setTimeout(() => print({ documentTitle: tituloDaImpressao }), 0);
  };

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
          <FiltroSelect
            id="audit-action"
            rotulo="Ação"
            valor={action}
            rotuloVazio="Todas"
            opcoes={ACTION_LABELS}
            onChange={(v) => {
              setAction(v);
              setPage(0);
            }}
          />

          <FiltroSelect
            id="audit-entity"
            rotulo="Tipo de registro"
            valor={entity}
            rotuloVazio="Todos"
            opcoes={ENTITY_LABELS}
            onChange={(v) => {
              setEntity(v);
              setPage(0);
            }}
          />

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

          <Button variant="secondary" size="sm" onClick={resetFilters}>
            Limpar
          </Button>

          <Button variant="secondary" size="sm" onClick={() => void imprimir()} disabled={imprimindo}>
            {imprimindo ? "Preparando…" : "Imprimir"}
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
          <table className="text-sm w-full min-w-[900px] text-left">
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
                  <td className="px-3 py-2 whitespace-nowrap text-secondary">{formatDateTime(log.created_at)}</td>
                  <td className="px-3 py-2 text-primary">{log.actor_email ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-secondary">{log.actor_ip ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-primary">
                    {ACTION_LABELS[log.action] ?? log.action}
                  </td>
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
          <Button
            variant="secondary"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Anterior
          </Button>
          <span className="text-13 text-secondary">Página {page + 1}</span>
          <Button variant="secondary" size="sm" disabled={!hasNextPage} onClick={() => setPage((p) => p + 1)}>
            Próxima
          </Button>
        </div>
      </div>
      <AuditLogsPrintDocument
        titulo={tituloDaImpressao}
        linhas={linhasDaImpressao}
        meta={[
          { label: "Ação", value: action ? ACTION_LABELS[action] : "Todas" },
          { label: "Tipo de registro", value: entity ? ENTITY_LABELS[entity] : "Todos" },
          {
            label: "Período",
            value:
              dateFrom || dateTo
                ? `${dateFrom ? formatDia(dateFrom) : "início"} a ${dateTo ? formatDia(dateTo) : "hoje"}`
                : "Todo o período",
          },
        ]}
      />
    </SettingsContentWrapper>
  );
}

export default observer(AuditoriaSettingsPage);
