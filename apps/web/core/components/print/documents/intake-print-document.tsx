/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { ISSUE_PRIORITIES } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TInboxIssueStatus } from "@plane/types";
import { renderFormattedDateTime } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
// store types
import type { IInboxIssueStore } from "@/store/inbox/inbox-issue.store";
// local imports
import { PrintButton } from "../print-button";
import { PrintDocument } from "../print-document";
import { PrintHtml } from "../print-html";
import { PrintFields, PrintSection } from "../print-section";

export const INTAKE_STATUS_LABELS: Record<number, string> = {
  [-2]: "Pendente",
  [-1]: "Recusada",
  0: "Adiada",
  1: "Aceita",
  2: "Duplicada",
  3: "Atendida",
};

const CELL = "border border-neutral-300 px-2 py-1 align-top";

const formatDateTime = (value?: string | Date | null) => (value ? new Date(value).toLocaleString("pt-BR") : "—");

type SingleProps = {
  inboxIssue: IInboxIssueStore;
};

/** Botão + documento de impressão de uma solicitação (intake). */
export const IntakePrintAction = observer(function IntakePrintAction(props: SingleProps) {
  const { inboxIssue } = props;
  const { t } = useTranslation();
  const { getProjectById, getProjectIdentifierById } = useProject();
  const { getStateById } = useProjectState();
  const { getUserDetails } = useMember();

  const issue = inboxIssue.issue;
  const identifier = issue?.project_id ? `${getProjectIdentifierById(issue.project_id) ?? ""}-${issue.sequence_id}` : "";
  const priority = ISSUE_PRIORITIES.find((item) => item.key === issue?.priority);
  const title = `Solicitação ${identifier} — ${issue?.name ?? ""}`;

  return (
    <>
      <PrintButton documentTitle={title} auditEntity="intake" auditEntityId={issue?.id ?? ""} />
      <PrintDocument
        title={title}
        subtitle={issue?.project_id ? getProjectById(issue.project_id)?.name : undefined}
        meta={[{ label: "Situação", value: INTAKE_STATUS_LABELS[inboxIssue.status as number] }]}
      >
        <PrintSection title="Propriedades">
          <PrintFields
            items={[
              { label: "Situação", value: INTAKE_STATUS_LABELS[inboxIssue.status as number] ?? "—" },
              { label: "Origem", value: inboxIssue.source ?? "—" },
              { label: "Solicitante", value: getUserDetails(inboxIssue.created_by ?? "")?.display_name ?? "—" },
              { label: "Estado", value: issue?.state_id ? (getStateById(issue.state_id)?.name ?? "—") : "—" },
              { label: "Prioridade", value: priority ? t(priority.titleTranslationKey) : "—" },
              { label: "Criada em", value: formatDateTime(issue?.created_at) },
              { label: "Adiada até", value: inboxIssue.snoozed_till ? formatDateTime(inboxIssue.snoozed_till) : "—" },
              { label: "Prazo", value: issue?.target_date ? renderFormattedDateTime(issue.target_date) : "—" },
              { label: "Duplicada de", value: inboxIssue.duplicate_issue_detail?.name ?? "—" },
            ]}
          />
        </PrintSection>

        <PrintSection title="Descrição">
          <PrintHtml html={issue?.description_html} fallback="Sem descrição." />
        </PrintSection>
      </PrintDocument>
    </>
  );
});

export type TIntakeListRecord = {
  id: string;
  status: TInboxIssueStatus | number;
  created_at?: string;
  project?: { identifier?: string; name?: string } | null;
  issue?: { name?: string } | null;
};

type ListProps = {
  title: string;
  subtitle?: string | null;
  statusLabel?: string;
  records: TIntakeListRecord[];
};

/** Documento de impressão para a listagem de solicitações. */
export const IntakeListPrintDocument = observer(function IntakeListPrintDocument(props: ListProps) {
  const { title, subtitle, statusLabel, records } = props;

  return (
    <PrintDocument
      title={title}
      subtitle={subtitle}
      meta={[
        { label: "Situação", value: statusLabel },
        { label: "Total", value: `${records.length} solicitação(ões)` },
      ]}
    >
      {records.length === 0 ? (
        <p className="py-4 text-xs">Nenhuma solicitação encontrada.</p>
      ) : (
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-neutral-100 text-left">
              <th className={CELL}>Projeto</th>
              <th className={CELL}>Solicitação</th>
              <th className={CELL}>Situação</th>
              <th className={CELL}>Criada em</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td className={CELL}>{record.project?.identifier ?? record.project?.name ?? "—"}</td>
                <td className={CELL}>{record.issue?.name ?? "Sem título"}</td>
                <td className={CELL}>{INTAKE_STATUS_LABELS[record.status as number] ?? "—"}</td>
                <td className={CELL}>{formatDateTime(record.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PrintDocument>
  );
});
