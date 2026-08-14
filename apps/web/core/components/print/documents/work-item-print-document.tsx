/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { ISSUE_PRIORITIES } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { renderFormattedDate, renderFormattedDateTime } from "@plane/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useLabel } from "@/hooks/store/use-label";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
// local imports
import { PrintDocument } from "../print-document";
import { PrintHtml } from "../print-html";
import { PrintFields, PrintSection } from "../print-section";

type Props = {
  issueId: string;
};

const formatDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString("pt-BR") : "—");

/** Documento de impressão do detalhe de um chamado. */
export const WorkItemPrintDocument = observer(function WorkItemPrintDocument(props: Props) {
  const { issueId } = props;
  const { t } = useTranslation();
  const {
    issue: { getIssueById },
    comment: { getCommentsByIssueId, getCommentById },
    attachment: { getAttachmentsByIssueId, getAttachmentById },
  } = useIssueDetail();
  const { getStateById } = useProjectState();
  const { getProjectById, getProjectIdentifierById } = useProject();
  const { getUserDetails } = useMember();
  const { getLabelById } = useLabel();

  const issue = getIssueById(issueId);
  if (!issue) return null;

  const identifier = `${getProjectIdentifierById(issue.project_id) ?? ""}-${issue.sequence_id}`;
  const priority = ISSUE_PRIORITIES.find((item) => item.key === issue.priority);
  const commentIds = getCommentsByIssueId(issueId) ?? [];
  const attachmentIds = getAttachmentsByIssueId(issueId) ?? [];

  const memberNames = (ids: string[] | null | undefined) =>
    (ids ?? [])
      .map((id) => getUserDetails(id)?.display_name)
      .filter(Boolean)
      .join(", ");

  const labelNames = (issue.label_ids ?? [])
    .map((id) => getLabelById(id)?.name)
    .filter(Boolean)
    .join(", ");

  return (
    <PrintDocument
      title={`${identifier} — ${issue.name}`}
      subtitle={getProjectById(issue.project_id)?.name}
      meta={[
        { label: "Estado", value: getStateById(issue.state_id)?.name },
        { label: "Prioridade", value: priority ? t(priority.titleTranslationKey) : undefined },
      ]}
    >
      <PrintSection title="Propriedades">
        <PrintFields
          items={[
            { label: "Estado", value: getStateById(issue.state_id)?.name ?? "—" },
            { label: "Prioridade", value: priority ? t(priority.titleTranslationKey) : "—" },
            { label: "Responsáveis", value: memberNames(issue.assignee_ids) },
            { label: "Etiquetas", value: labelNames },
            { label: "Data de início", value: issue.start_date ? renderFormattedDate(issue.start_date) : "—" },
            { label: "Prazo", value: issue.target_date ? renderFormattedDateTime(issue.target_date) : "—" },
            { label: "Criado em", value: formatDateTime(issue.created_at) },
            { label: "Atualizado em", value: formatDateTime(issue.updated_at) },
            { label: "Criado por", value: getUserDetails(issue.created_by)?.display_name ?? "—" },
          ]}
        />
      </PrintSection>

      <PrintSection title="Descrição">
        <PrintHtml html={issue.description_html} fallback="Sem descrição." />
      </PrintSection>

      <PrintSection title={`Anexos (${attachmentIds.length})`}>
        {attachmentIds.length === 0 ? (
          <p>Nenhum anexo.</p>
        ) : (
          <ul className="list-disc pl-4">
            {attachmentIds.map((attachmentId) => {
              const attachment = getAttachmentById(attachmentId);
              if (!attachment) return null;
              return (
                <li key={attachmentId}>
                  {attachment.attributes?.name ?? attachmentId}
                  {attachment.created_by && ` — ${getUserDetails(attachment.created_by)?.display_name ?? ""}`}
                </li>
              );
            })}
          </ul>
        )}
      </PrintSection>

      <PrintSection title={`Comentários (${commentIds.length})`}>
        {commentIds.length === 0 ? (
          <p>Nenhum comentário.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {commentIds.map((commentId) => {
              const comment = getCommentById(commentId);
              if (!comment) return null;
              return (
                <article key={commentId} className="print-avoid-break border-b border-neutral-200 pb-2 last:border-0">
                  <p className="text-[10px] font-semibold">
                    {comment.actor_detail?.display_name ?? getUserDetails(comment.actor)?.display_name ?? "—"}
                    <span className="ml-2 font-normal text-neutral-500">{formatDateTime(comment.created_at)}</span>
                  </p>
                  <PrintHtml html={comment.comment_html} fallback={comment.comment_stripped} />
                </article>
              );
            })}
          </div>
        )}
      </PrintSection>
    </PrintDocument>
  );
});
