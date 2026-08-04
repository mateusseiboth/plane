/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import type { TIssue } from "@plane/types";
// local imports
import { PrintDocument } from "../print-document";
import type { TPrintMetaItem } from "../print-header";
import { PrintIssuesTable } from "../print-issues-table";

type Props = {
  title: string;
  subtitle?: string | null;
  meta?: TPrintMetaItem[];
  issues: TIssue[];
  showProject?: boolean;
};

/**
 * Documento de impressão para qualquer listagem de chamados (lista, tabela,
 * ciclo, módulo, visão). Recebe apenas os chamados já filtrados pela tela.
 */
export const WorkItemsPrintDocument = observer(function WorkItemsPrintDocument(props: Props) {
  const { title, subtitle, meta, issues, showProject = true } = props;

  return (
    <PrintDocument
      title={title}
      subtitle={subtitle}
      meta={[...(meta ?? []), { label: "Total", value: `${issues.length} chamado(s)` }]}
    >
      <PrintIssuesTable issues={issues} showProject={showProject} />
    </PrintDocument>
  );
});
