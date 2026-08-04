/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { EIssuesStoreType } from "@plane/types";
import { renderFormattedDate } from "@plane/utils";
// hooks
import { useCycle } from "@/hooks/store/use-cycle";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
// local imports
import { PrintButton } from "../print-button";
import { PrintDocument } from "../print-document";
import { PrintIssuesTable } from "../print-issues-table";
import { PrintFields, PrintSection } from "../print-section";
import { usePrintableIssues } from "../use-printable-issues";

type Props = {
  cycleId: string;
};

/** Visão geral de um ciclo + chamados atualmente listados. */
export const CyclePrintDocument = observer(function CyclePrintDocument(props: Props) {
  const { cycleId } = props;
  const { getCycleById } = useCycle();
  const { getProjectById } = useProject();
  const { getUserDetails } = useMember();
  const issues = usePrintableIssues(EIssuesStoreType.CYCLE);

  const cycle = getCycleById(cycleId);
  if (!cycle) return null;

  const title = `Ciclo — ${cycle.name}`;

  return (
    <>
      <PrintButton documentTitle={title} auditEntity="cycle" auditEntityId={cycleId} />
      <PrintDocument title={title} subtitle={getProjectById(cycle.project_id)?.name}>
        <PrintSection title="Visão geral">
          <PrintFields
            items={[
              { label: "Início", value: cycle.start_date ? renderFormattedDate(cycle.start_date) : "—" },
              { label: "Término", value: cycle.end_date ? renderFormattedDate(cycle.end_date) : "—" },
              { label: "Responsável", value: getUserDetails(cycle.owned_by_id)?.display_name ?? "—" },
              { label: "Total de chamados", value: String(cycle.total_issues ?? 0) },
              { label: "Concluídos", value: String(cycle.completed_issues ?? 0) },
              { label: "Em andamento", value: String(cycle.started_issues ?? 0) },
              { label: "Não iniciados", value: String(cycle.unstarted_issues ?? 0) },
              { label: "Backlog", value: String(cycle.backlog_issues ?? 0) },
              { label: "Cancelados", value: String(cycle.cancelled_issues ?? 0) },
            ]}
          />
        </PrintSection>

        {cycle.description && (
          <PrintSection title="Descrição">
            <p>{cycle.description}</p>
          </PrintSection>
        )}

        <PrintSection title={`Chamados (${issues.length})`}>
          <PrintIssuesTable issues={issues} showProject={false} />
        </PrintSection>
      </PrintDocument>
    </>
  );
});
