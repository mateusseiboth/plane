/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { usePathname } from "next/navigation";
import { observer } from "mobx-react";
// plane imports
import { Logo } from "@plane/propel/emoji-icon-picker";
import type { TIssueIdentifierProps, TIssueTypeIdentifier } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { IdentifierText } from "@/components/issues/issue-detail/identifier-text";

export const IssueIdentifier = observer(function IssueIdentifier(props: TIssueIdentifierProps) {
  const { projectId, variant, size, displayProperties, enableClickToCopyIdentifier = false } = props;
  // store hooks
  const { getProjectIdentifierById, getProjectById } = useProject();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  // Determine if the component is using store data or not
  const isUsingStoreData = "issueId" in props;
  // derived values
  const issue = isUsingStoreData ? getIssueById(props.issueId) : null;
  const projectIdentifier = isUsingStoreData ? getProjectIdentifierById(projectId) : props.projectIdentifier;
  const issueSequenceId = isUsingStoreData ? issue?.sequence_id : props.issueSequenceId;
  const shouldRenderIssueID = displayProperties ? displayProperties.key : true;

  // O ícone do sistema só acompanha o código nas visualizações do ESPAÇO
  // ("Todos os chamados"), onde cada linha é de um sistema diferente e o
  // desenho identifica antes da sigla. Dentro de um sistema, e na tela do
  // chamado, ele seria a mesma figura repetida em toda linha.
  const pathname = usePathname();
  const isVisaoDoEspaco = pathname?.includes("/workspace-views/") ?? false;
  const logoDoSistema = isVisaoDoEspaco ? getProjectById(projectId)?.logo_props : undefined;

  if (!shouldRenderIssueID) return null;

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {logoDoSistema?.in_use && <Logo logo={logoDoSistema} size={16} />}
      <IdentifierText
        identifier={`${projectIdentifier}-${issueSequenceId}`}
        enableClickToCopyIdentifier={enableClickToCopyIdentifier}
        variant={variant}
        size={size}
      />
    </div>
  );
});

export const IssueTypeIdentifier = observer(function IssueTypeIdentifier(_props: TIssueTypeIdentifier) {
  return <></>;
});
