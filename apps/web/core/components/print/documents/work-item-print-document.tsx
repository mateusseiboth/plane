/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { ISSUE_PRIORITIES } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { getNumerosDoChamado, renderFormattedDate, renderFormattedDateTime } from "@plane/utils";
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
import { buildHistoricoDoChamado, readEncerramento } from "./historico-do-chamado";

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
    activity: { getActivitiesByIssueId, getActivityById },
  } = useIssueDetail();
  const { getStateById } = useProjectState();
  const { getProjectById, getProjectIdentifierById } = useProject();
  const { getUserDetails } = useMember();
  const { getLabelById } = useLabel();

  const issue = getIssueById(issueId);
  if (!issue) return null;

  const identifier = `${getProjectIdentifierById(issue.project_id) ?? ""}-${issue.sequence_id}`;
  const priority = ISSUE_PRIORITIES.find((item) => item.key === issue.priority);
  const numeros = getNumerosDoChamado(issue);
  const commentIds = getCommentsByIssueId(issueId) ?? [];
  const attachmentIds = getAttachmentsByIssueId(issueId) ?? [];
  const atividades = (getActivitiesByIssueId(issueId) ?? []).map((id) => getActivityById(id)).filter((a) => !!a);
  const historico = buildHistoricoDoChamado(atividades);
  const etapaAtual = getStateById(issue.state_id);
  const encerramento = readEncerramento(atividades, etapaAtual, issue.completed_at);

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
      title={`${numeros.numero ?? identifier}: ${issue.name}`}
      subtitle={getProjectById(issue.project_id)?.name}
      meta={[
        { label: "Número", value: numeros.numero ?? undefined },
        { label: "Identificador", value: identifier },
        { label: "Número antigo", value: numeros.legado ?? undefined },
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

      {encerramento && (
        <PrintSection title="Encerramento">
          <PrintFields
            items={[
              { label: "Etapa", value: encerramento.etapa },
              { label: "Encerrado em", value: formatDateTime(encerramento.em) },
              { label: "Encerrado por", value: encerramento.por ?? "—" },
            ]}
          />
        </PrintSection>
      )}

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
                  {attachment.created_by && ` · ${getUserDetails(attachment.created_by)?.display_name ?? ""}`}
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
                <article key={commentId} className="print-avoid-break border-neutral-200 border-b pb-2 last:border-0">
                  <p className="text-[10px] font-semibold">
                    {comment.actor_detail?.display_name ?? getUserDetails(comment.actor)?.display_name ?? "—"}
                    <span className="font-normal text-neutral-500 ml-2">{formatDateTime(comment.created_at)}</span>
                  </p>
                  <PrintHtml html={comment.comment_html} fallback={comment.comment_stripped} />
                </article>
              );
            })}
          </div>
        )}
      </PrintSection>

      <PrintSection title={`Histórico (${historico.length})`}>
        {historico.length === 0 ? (
          <p>Nenhuma alteração registrada.</p>
        ) : (
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="bg-neutral-100 text-left">
                <th className="border-neutral-300 border px-2 py-1">Data e hora</th>
                <th className="border-neutral-300 border px-2 py-1">Usuário</th>
                <th className="border-neutral-300 border px-2 py-1">Ação</th>
                <th className="border-neutral-300 border px-2 py-1">Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((linha) => (
                <tr key={linha.id} className="print-avoid-break">
                  <td className="border-neutral-300 border px-2 py-1">{formatDateTime(linha.em)}</td>
                  <td className="border-neutral-300 border px-2 py-1">{linha.autor}</td>
                  <td className="border-neutral-300 border px-2 py-1">{linha.acao}</td>
                  <td className="border-neutral-300 border px-2 py-1">{linha.detalhe || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PrintSection>
    </PrintDocument>
  );
});
